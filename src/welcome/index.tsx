import { createSignal } from "solid-js";
import { create_room, join_room, new_room_player_count, set_new_room_player_count, set_this_player_name } from "..";
import css from "../welcome/index.css?raw"
const [log_message, set_log_message] = createSignal("");

export default function WelcomeScreen () {
    return ( <main>
        <style>{css}</style>

        <h1>PatchIt</h1>
        <input id="player_name_input" placeholder="john" oninput={(event: any) => {
            set_this_player_name(event.target.value);
        }}/>

        <label id="player_count_label">{new_room_player_count()}</label>
        <input id="player_count_input" type="range" value={2} max={10} min={2} oninput={(event: any) => {
            set_new_room_player_count(parseInt(event.target.value))
        }} />

        <button id="create_room_button" onclick={create_room}>create room</button>
        <input type="text" id="enter_code_input" placeholder="enter room code here"
            onkeydown={(event: any) => { 
                if (event.key == "Enter") { handle_join_room(event.target.value); }
            }}
        />
        <p id="log_message">{log_message()}</p>
    </main> );
}

function handle_join_room(code: string) {
    join_room(code.toLocaleUpperCase(), set_log_message);
}