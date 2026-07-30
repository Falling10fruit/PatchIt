import { createSignal } from "solid-js";
import {
    create_room,
    join_room,
    new_room_player_count,
    set_new_room_player_count,
    set_this_player_name,
    this_player_name,
} from "../main";
import css from "../welcome/index.css?raw"
const [log_message, set_log_message] = createSignal("");

export default function WelcomeScreen () {
    return ( <>
        <style>{css}</style>

        <main class="welcome-screen">
            <div class="matrix-shade" aria-hidden="true" />

            <section class="landing-content" aria-labelledby="patchit-title">
                <h1 id="patchit-title">PatchIt!</h1>

                <section class="settings-panel" aria-labelledby="settings-title">
                    <h2 id="settings-title">Settings</h2>

                    <label class="setting-field" for="player_name_input">
                        <span>Username:</span>
                        <input
                            id="player_name_input"
                            type="text"
                            value={this_player_name()}
                            maxlength={20}
                            autocomplete="nickname"
                            onInput={(event) => set_this_player_name(event.currentTarget.value)}
                        />
                    </label>

                    <label class="setting-field" for="player_count_input">
                        <span class="player-count-heading">
                            Max Players:
                            <output for="player_count_input">{new_room_player_count()}</output>
                        </span>
                        <input
                            id="player_count_input"
                            type="range"
                            value={new_room_player_count()}
                            max={10}
                            min={2}
                            onInput={(event) => {
                                set_new_room_player_count(parseInt(event.currentTarget.value, 10));
                            }}
                        />
                    </label>
                </section>

                <button id="create_room_button" type="button" onClick={create_room}>
                    Create Lobby
                </button>

                <section class="join-panel" aria-labelledby="join-lobby-title">
                    <h2 id="join-lobby-title">Join Lobby</h2>
                    <label class="sr-only" for="enter_code_input">Lobby code</label>
                    <input
                        id="enter_code_input"
                        type="text"
                        maxlength={5}
                        autocomplete="off"
                        spellcheck={false}
                        aria-describedby="log_message"
                        onInput={(event) => {
                            event.currentTarget.value = event.currentTarget.value.toUpperCase();
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                handle_join_room(event.currentTarget.value);
                            }
                        }}
                    />
                    <p id="log_message" aria-live="polite">{log_message()}</p>
                </section>

                <p class="tagline">
                    <span>Compete with your friend and</span>
                    <strong>CATCH BUGS IN REAL TIME</strong>
                </p>
            </section>
        </main>
    </> );
}

function handle_join_room(code: string) {
    join_room(code.toUpperCase(), set_log_message);
}
