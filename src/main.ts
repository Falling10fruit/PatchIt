import { App, current_screen, Screens, set_current_screen } from "./index.tsx";
import { render } from "solid-js/web";

import { initializeApp } from "firebase/app"
import { getDatabase, ref, set, get, onValue, DatabaseReference, child, update, increment, off } from "firebase/database"
import { createSignal, Signal, SignalOptions } from "solid-js";
import { OpenAI } from "openai";

window.open_ai_client = new OpenAI({ apiKey: import.meta.env.VITE_API_AI_KEY, dangerouslyAllowBrowser: true });
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
const [room_id, set_room_id] = createSignal("");
const [this_player_name, set_this_player_name] = createSignal(["john", "gabrielle", "houston", "tommy", "harrison", "joey", "terry", "anna"][Math.floor(Math.random() * 8)]);
const [players_joined, set_players_joined] = createSignal<Player[]>([]);

function create_room () {
    let new_room_code = "";
    for (let i = 0; i < 5; i++) {
        new_room_code += random_characters[Math.floor(Math.random() * random_characters.length)];
    } console.log("creating new room with id", new_room_code);
    
    set_room_id(new_room_code);
    window.room_reference = ref(database, "rooms/" + new_room_code);
    set(window.room_reference, {
        host: window.this_user_id,

        max_player_count: new_room_player_count(),
        current_player_count: 1,
        players: {},

    } as Room);
    set_players_joined([ {
        name: this_player_name(),
        ready: false, code: ""
    } ]);
    
    set_room_id(new_room_code);
    enter_lobby(window.room_reference);
}

async function join_room(code: string, set_log_message: any) {
    const reference = ref(database, "rooms/" + code);
    const current_snap = await get(reference);
    const does_exist = current_snap.exists();
    if (does_exist) {
        set_log_message("room found! joining lobby");
        window.room_reference = reference;
        update_room(current_snap.val());
        set_room_id(code);
        enter_lobby(reference);
    } else {
        set_log_message("room not found");
    }
}
window.onkeydown = (e) => {
    if (e.key == "h") {
        console.log(Object.entries(window.room_snapshot.players).reduce(
            (prev, [current_id, current_player]) => prev &&= current_id == window.this_user_id ? true : current_player.ready,
        true));
    }
}
function set_ready(ready_status: boolean) {
    update(child(window.room_reference, "players/" + window.this_user_id), { ready: ready_status });

    if (window.this_user_id == window.room_snapshot.host && ready_status) {
        const did_everyone_else_already_ready = Object.entries(window.room_snapshot.players).reduce(
            (prev, [current_id, current_player]) => prev &&= current_id == window.this_user_id ? true : current_player.ready,
        true);

        if (did_everyone_else_already_ready) start_game();
    }
}

function enter_lobby (reference: DatabaseReference) {
    set(child(window.room_reference, "players/" + window.this_user_id), {
        name: this_player_name(),
        ready: false,
        code: ""
    }); update(window.room_reference, { current_player_count: increment(1) });
    set_current_screen(Screens.LOBBY_SCREEN);
    onValue(window.room_reference, (snapshot) => { update_room(snapshot.val()); });
}

function leave_room() {
    set_current_screen(Screens.WELCOME_SCREEN);
    window.room_snapshot.host == "";

    update(window.room_reference, { current_player_count: increment(-1), players: { [window.this_user_id]: null } })
    off(window.room_reference);
    
    set_room_id("");
}

async function update_room(data: Room) {
    console.log("dwdwdw");
    window.room_snapshot = data;

    if (current_screen() == Screens.LOBBY_SCREEN) {
        set_players_joined(Object.entries(data.players).map(([id, player]) => player));

        if (data.host == window.this_user_id) {
            let all_ready = true;
            for (const [user_id, {ready}] of Object.entries(data.players)) { all_ready &&= ready; }
            if (all_ready) start_game();
        } else if (data.playing_now) {
            set_current_screen(Screens.PLAY_SCREEN);
        };
    } else if (current_screen() == Screens.PLAY_SCREEN) {
    }
}

async function start_game() {
    set_current_screen(Screens.PLAY_SCREEN);
    await generate_problem();

    update(window.room_reference, { playing_now: true });

}

async function generate_problem() {
    const response = await window.open_ai_client.responses.create({
        model: "gpt-5.4-mini",
        instructions: 'You are the core engine of a JavaScript debugging game. Your primary task is to generate broken JavaScript code snippets for players to fix, along with automated test cases. RULES AND CONSTRAINTS: 1. Pure JavaScript Only: No HTML, CSS, DOM manipulation, or browser-specific APIs. Stick to core logic, math, array/object manipulation, algorithms, or async/await patterns. 2. Difficulty Scaling (1-100): The user will request a target difficulty. You must generate a challenge matching this scale and evaluate the final difficulty of your generated code. - 1-30 (Beginner): Simple syntax errors, typos, basic math/logic flaws, basic array iterations. - 31-70 (Intermediate): Scope issues, incorrect array methods, loose/strict equality, object mutation, variable shadowing. - 71-100 (Expert): Async/await handling, Promise chains, closure bugs, complex algorithms, prototype issues, or race conditions. 3. Fixable Bugs: Introduce 1 to 3 distinct bugs appropriate for the difficulty level. 4. Code Structure: The generated code MUST be a single function that returns a value, so it can be automatically tested. OUTPUT FORMAT: You must respond STRICTLY with a valid JSON object. Do not wrap the JSON in markdown formatting (like ```json), and do not include any conversational text. Use the following schema: { "title": "A short, catchy title for the challenge", "intended_behavior": "A brief description of what the function is supposed to do.", "broken_code": "The raw JS code string containing the bugs. Use \n for line breaks.", "solution_code": "The corrected, fully functional JS code string.", "difficulty_score": <An integer between 1 and 100 representing the actual difficulty of the generated code>, "test_cases": [ { "input_args": ["Array of arguments to pass into the function"], "expected_output": "The exact value the function should return" } ] }',
        text: { format: {
            type: "json_schema",
            name: "coding_challenge",
            strict: true,
            schema: {
                type: "object",
                properties: {
                    title: {
                        type: "string",
                        description: "The title of the coding challenge."
                    },
                    intended_behavior: {
                        type: "string",
                        description: "A detailed description of what the code is supposed to do."
                    },
                    broken_code: {
                        type: "string",
                        description: "The provided code with intentional bugs or errors for the challenge."
                    },
                    solution_code: {
                        type: "string",
                        description: "The correct solution code for the coding challenge."
                    },
                    difficulty_score: {
                        type: "number",
                        description: "A numerical score ranging from 0 to 100 representing the difficulty of the challenge."
                    },
                    test_cases: {
                        type: "array",
                        description: "List of test cases to validate solution correctness.",
                        items: {
                        type: "object",
                        properties: {
                            input_args: {
                                type: "array",
                                description: "List of input arguments for the function.",
                                items: {
                                    type: "string",
                                    description: "String representation of a single argument."
                                }
                            },
                            expected_output: {
                                type: "string",
                                description: "Expected output for the test case, as a string."
                            }
                        },
                        required: [
                            "input_args",
                            "expected_output"
                        ],
                        additionalProperties: false
                    }
                }
            },
            required: [
                "title",
                "intended_behavior",
                "broken_code",
                "solution_code",
                "difficulty_score",
                "test_cases"
            ],
            additionalProperties: false
            }
        } },
        input: "Difficulty: " + window.difficulty,
    });

    console.log(response);
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
    room_id,
    leave_room,
    players_joined,
    set_ready,
}

const root = document.getElementById("root")
if (root) render(App, root);