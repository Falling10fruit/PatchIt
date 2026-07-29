import { createSignal, For } from "solid-js";
import css from "../lobby/index.css?raw"
import { leave_room, players_joined, room_id, set_ready } from "../main";

const [ready_button_text, set_ready_button_text] = createSignal("ready?")

export default function LobbyScreen () {
    return ( <main>
        <style>{css}</style>

        <h1>room id: {room_id()}</h1> <button id="leave_button" onclick={leave_room}>leave</button>

        <ul>
            <For each={players_joined()}> 
                { (player) => <li>{player.name} is {player.ready ? "ready!" : "not ready"}</li> }
            </For>
        </ul>

        <button id="ready_button" onclick={handle_ready_button}>{ ready_button_text() }</button>
    </main> );
}

function handle_ready_button() {
    if (ready_button_text() == "ready?") {
        set_ready_button_text("ready!");
        set_ready(true);
    } else {
        set_ready_button_text("ready?");
        set_ready(false);
    }
}
