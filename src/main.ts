import { App, current_screen, Screens, set_current_screen } from "./index.tsx";
import { render } from "solid-js/web";

import { initializeApp } from "firebase/app"
import { getDatabase, ref, set, get, onValue, DatabaseReference, child, update, increment, off, remove } from "firebase/database"
import { createSignal, Signal, SignalOptions } from "solid-js";
import { OpenAI } from "openai";
import { start_game, update_challenge } from "./play/index.tsx";

window.open_ai_client = new OpenAI({ apiKey: import.meta.env.VITE_API_AI_KEY, dangerouslyAllowBrowser: true });
const app = initializeApp({
    apiKey: "AIzaSyB-_eEMOa9D_Q1bIREy8YqLFw1ve0BLUnE",
    authDomain: "patchit-8af4d.firebaseapp.com",
    databaseURL: "https://patchit-8af4d-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "patchit-8af4d",
    storageBucket: "patchit-8af4d.firebasestorage.app",
    messagingSenderId: "616259528072",
    appId: "1:616259528072:web:d4c2f03617a3557b9d063d"
}); window.database = getDatabase(app);

const random_characters = "QWERTYUIOPASDFGHJKLZXCVBNM1234567890";
window.this_user_id = "";
window.difficulty = 5;
for (let i = 0; i < 10; i++) {
    window.this_user_id += random_characters[Math.floor(Math.random() * random_characters.length)];
} console.log("this_user_id", window.this_user_id);

const [new_room_player_count, set_new_room_player_count] = createSignal(4);
const [room_id, set_room_id] = createSignal("");
const [this_player_name, set_this_player_name] = createSignal(["john", "gabrielle", "houston", "tommy", "harrison", "joey", "terry", "anna"][Math.floor(Math.random() * 8)]);
const [players_joined, set_players_joined] = createSignal<[string, Player][]>([]);

function create_room () {
    let new_room_code = "";
    for (let i = 0; i < 5; i++) {
        new_room_code += random_characters[Math.floor(Math.random() * random_characters.length)];
    } console.log("creating new room with id", new_room_code);
    
    set_room_id(new_room_code);
    window.room_reference = ref(window.database, "rooms/" + new_room_code);
    set(window.room_reference, {
        host: window.this_user_id,

        max_player_count: new_room_player_count(),
        current_player_count: 1,
        players: {},

        playing_now: false,
        start_time: 0,
        finish_time: 0,
    } as Room);
    set_players_joined([ [window.this_user_id, {
        name: this_player_name(),
        ready: false, code: ""
    }] ]);

    set_room_id(new_room_code);
    enter_lobby(window.room_reference);
}

async function join_room(code: string, set_log_message: any) {
    const reference = ref(window.database, "rooms/" + code);
    const current_snap = await get(reference);
    const does_exist = current_snap.exists();
    if (does_exist) {
        update_room(current_snap.val());
        if (window.room_snapshot.max_player_count == window.room_snapshot.current_player_count) {
            set_log_message("room full! max " + window.room_snapshot.max_player_count + " players");
            return;
        }

        set_log_message("room found! joining lobby");
        window.room_reference = reference;
        set_room_id(code);
        enter_lobby(reference);
        set_log_message("");
    } else {
        set_log_message("room not found");
    }
}
window.onkeydown = (e) => {
    if (e.key == "h") {
        console.log(Object.entries(window.room_snapshot.players).every(([player_id, player]) => player_id == window.this_user_id ? true : player.ready));
    }
}
function set_ready(ready_status: boolean) {
    update(child(window.room_reference, "players/" + window.this_user_id), { ready: ready_status });

    if (window.this_user_id == window.room_snapshot.host && ready_status) {
        if (
            Object.entries(window.room_snapshot.players).every(([player_id, player]) => player_id == window.this_user_id ? true : player.ready)
        ) { start_game(); }
    }
}

function enter_lobby (reference: DatabaseReference) {
    update(window.room_reference, {
        current_player_count: increment(1),
        ["players/" + window.this_user_id]: {
            name: this_player_name(),
            ready: false,
            code: ""
        }
    });
    set_current_screen(Screens.LOBBY_SCREEN);
    onValue(window.room_reference, (snapshot) => { update_room(snapshot.val()); });
}

function leave_room() {
    set_current_screen(Screens.WELCOME_SCREEN);
    window.room_snapshot.host == "";

    update(window.room_reference, { current_player_count: increment(-1), ["players/" + window.this_user_id]: null })
    if (window.room_snapshot.host == window.this_user_id) remove(window.room_reference);
    off(window.room_reference);
    
    set_room_id("");
}

async function update_room(data: Room) {
    window.room_snapshot = data;
    set_players_joined(Object.entries(data.players).map(([id, player]) => [id, player]));

    if (current_screen() == Screens.LOBBY_SCREEN) {
        if (data.host == window.this_user_id) {
            let all_ready = true;
            for (const [user_id, {ready}] of Object.entries(data.players)) { all_ready &&= ready; }
            if (all_ready) start_game();
        } else if (data.playing_now) {
            set_current_screen(Screens.PLAY_SCREEN);
        };
    } else if (current_screen() == Screens.PLAY_SCREEN) {
        update_challenge();
    }
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