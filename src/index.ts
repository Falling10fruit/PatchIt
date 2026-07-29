import { App, current_screen, Screens, set_current_screen } from "./index.tsx";
import { render } from "solid-js/web";

import { initializeApp } from "firebase/app"
import { getDatabase, ref, set, get, onValue, DatabaseReference, child, update } from "firebase/database"
import { createSignal, Signal, SignalOptions } from "solid-js";
import { OpenAI } from "openai";

window.open_ai_client = new OpenAI();
const app = initializeApp({
    apiKey: "AIzaSyB-_eEMOa9D_Q1bIREy8YqLFw1ve0BLUnE",
    authDomain: "patchit-8af4d.firebaseapp.com",
    databaseURL: "https://patchit-8af4d-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "patchit-8af4d",
    storageBucket: "patchit-8af4d.firebasestorage.app",
    messagingSenderId: "616259528072",
    appId: "1:616259528072:web:d4c2f03617a3557b9d063d"
}); const database = getDatabase(app);

const random_characters = "QWERTYUIOPASDFGHJKLZXCVBNM1234567890";
window.this_user_id = "";
window.difficulty = 5;
for (let i = 0; i < 10; i++) {
    window.this_user_id += random_characters[Math.floor(Math.random() * random_characters.length)];
} console.log("this_user_id", window.this_user_id);

const [new_room_player_count, set_new_room_player_count] = createSignal(2);
const [this_player_name, set_this_player_name] = createSignal("john");
const [players_joined, set_players_joined] = createSignal<string[]>([]);

function create_room () {
    let new_room_id = "";
    for (let i = 0; i < 5; i++) {
        new_room_id += random_characters[Math.floor(Math.random() * random_characters.length)];
    } console.log("creating new room with id", new_room_id);
    
    window.room_reference = ref(database, "rooms/" + new_room_id);
    set(window.room_reference, {
        host: window.this_user_id,
        players: { [window.this_user_id]: {
            name: this_player_name(),
            code: ""
        } }
    });
    set_players_joined([ this_player_name() ]); // figure out why I can't create a ist of players
    
    enter_lobby(window.room_reference);
}

async function join_room(code: string, set_log_message: any) {
    const reference = ref(database, "rooms/" + code);
    const current_snap = await get(reference);
    const does_exist = current_snap.exists();
    if (does_exist) {
        set_log_message("room found! joining lobby");
        update_room(current_snap.val());

        enter_lobby(reference);
    } else {
        set_log_message("room not found");
    }
}

function set_ready(ready_status: boolean) {
    update(child(window.room_reference, "players/" + window.this_user_id), { ready: ready_status });
}

function enter_lobby (reference: DatabaseReference) {
    set_current_screen(Screens.LOBBY_SCREEN);
    onValue(reference, (snapshot) => { update_room(snapshot.val()); });
}

async function update_room(data: Room) {
    if (current_screen() == Screens.LOBBY_SCREEN) {
        set_players_joined(Object.entries(data.players).map(([id, player]) => player.name));

        if (data.host == window.this_user_id) {
            let all_ready = true;
            for (const [user_id, {ready}] of Object.entries(data.players)) { all_ready &&= ready; }
            if (all_ready) {
                await generate_problem();

                update(window.room_reference, { playing_now: true });
                set_current_screen(Screens.PLAY_SCREEN);
            }
        } else if (data.playing_now) {
            set_current_screen(Screens.PLAY_SCREEN);
        };
    } else if (current_screen() == Screens.PLAY_SCREEN) {
    }
}

async function generate_problem() {
    const response = await window.open_ai_client.responses.create({
        model: "gpt-5.4-mini",
        instructions: 'You are the core engine of a JavaScript debugging game. Your primary task is to generate broken JavaScript code snippets for players to fix, along with automated test cases. RULES AND CONSTRAINTS: 1. Pure JavaScript Only: No HTML, CSS, DOM manipulation, or browser-specific APIs. Stick to core logic, math, array/object manipulation, algorithms, or async/await patterns. 2. Difficulty Scaling (1-100): The user will request a target difficulty. You must generate a challenge matching this scale and evaluate the final difficulty of your generated code. - 1-30 (Beginner): Simple syntax errors, typos, basic math/logic flaws, basic array iterations. - 31-70 (Intermediate): Scope issues, incorrect array methods, loose/strict equality, object mutation, variable shadowing. - 71-100 (Expert): Async/await handling, Promise chains, closure bugs, complex algorithms, prototype issues, or race conditions. 3. Fixable Bugs: Introduce 1 to 3 distinct bugs appropriate for the difficulty level. 4. Code Structure: The generated code MUST be a single function that returns a value, so it can be automatically tested. OUTPUT FORMAT: You must respond STRICTLY with a valid JSON object. Do not wrap the JSON in markdown formatting (like ```json), and do not include any conversational text. Use the following schema: { "title": "A short, catchy title for the challenge", "intended_behavior": "A brief 1-2 sentence description of what the function is supposed to do.", "broken_code": "The raw JS code string containing the bugs. Use \n for line breaks.", "solution_code": "The corrected, fully functional JS code string.", "difficulty_score": <An integer between 1 and 100 representing the actual difficulty of the generated code>, "hints": [ "A subtle nudge pointing to the general area of the problem.", "A more direct hint explaining the concept that is failing." ], "test_cases": [ { "input_args": ["Array of arguments to pass into the function"], "expected_output": "The exact value the function should return" } ] }',
        input: "Difficulty: " + window.difficulty
    });
}

export {
    // server
    create_room,
    join_room,
    
    // welcome
    new_room_player_count,
    set_new_room_player_count,
    this_player_name,
    set_this_player_name,

    // lobby
    players_joined,
    set_ready,
}

const root = document.getElementById("root")
if (root) render(App, root);