import { initializeApp } from "firebase/app"
import { getDatabase, ref, set, get, onValue } from "firebase/database"
import { createSignal, Signal, SignalOptions } from "solid-js";

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
let this_user_id = "";
for (let i = 0; i < 10; i++) {
    this_user_id += random_characters[Math.floor(Math.random() * random_characters.length)];
} console.log("this_user_id", this_user_id);

const [new_room_player_count, set_new_room_player_count] = createSignal(2);
const [this_player_name, set_this_player_name] = createSignal("john");

function create_room () {
    let new_room_id = "";
    for (let i = 0; i < 5; i++) {
        new_room_id += random_characters[Math.floor(Math.random() * random_characters.length)];
    } console.log("creating new room with id", new_room_id);
    
    set(ref(database, "rooms/" + new_room_id), {
        host: this_user_id,
        players: {
            [this_user_id]: {
                name: this_player_name(),
                code: ""
            }
        }
    });
}

async function join_room(code: string, set_log_message: any) {
    const reference = ref(database, "rooms/" + code);
    const current_snap = await get(reference);
    const does_exist = current_snap.exists();
    if (does_exist) {
        set_log_message("room found! joining lobby");
        update_room(current_snap.val());

        onValue(reference, (snapshot) => {
            update_room(snapshot.val());
        });
    } else {
        set_log_message("room not found");
    }
}

function update_room(data: any) {

}

export {
    create_room,
    join_room,
    new_room_player_count,
    set_new_room_player_count,
    this_player_name,
    set_this_player_name
}

import { render } from "solid-js/web";
import { App } from "./index.tsx";
const root = document.getElementById("root")
if (root) render(App, root);