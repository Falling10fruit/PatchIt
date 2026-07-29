import { createSignal, For } from "solid-js";
import css from "../lobby/index.css?raw"
import { players_joined, set_ready } from "..";

const [ready_button_text, set_ready_button_text] = createSignal("ready?")

export default function LobbyScreen () {
    return ( <main>
        <style>{css}</style>

        <ul>
            <For each={players_joined()}> 
                { (name) => <li>{name}</li> }
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