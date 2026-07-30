import { createSignal, For } from "solid-js";
import css from "../lobby/index.css?raw";
import MatrixRain from "../components/MatrixRain";
import { leave_room, players_joined, room_id, set_ready } from "../main";

const [is_ready, set_is_ready] = createSignal(false);

export default function LobbyScreen() {
    return (
        <main class="lobby-screen">
            <style>{css}</style>
            <MatrixRain />
            <div class="matrix-shade" aria-hidden="true" />

            <section class="lobby-content">
                <header class="lobby-header">
                    <p class="lobby-brand">PatchIt!</p>
                    <button id="leave_button" type="button" onClick={leave_room}>
                        Leave Lobby
                    </button>
                </header>

                <section class="room-code-panel" aria-labelledby="room-code-title">
                    <h1>{room_id()}</h1>
                    <p id="room-code-title">Lobby code</p>
                </section>

                <section class="players-stage">
                    <section class="players-panel" aria-labelledby="players-title">
                        <header>
                            <h2 id="players-title">Players</h2>
                            <span>{players_joined().length} connected</span>
                        </header>

                        <ul>
                            <For
                                each={players_joined()}
                                fallback={<li class="empty-player-list">Waiting for players...</li>}
                            >
                                {(player) => (
                                    <li classList={{ "player-ready": player.ready }}>
                                        <span class="player-avatar">
                                            {player.name.slice(0, 1).toUpperCase()}
                                        </span>
                                        <span class="player-name">{player.name}</span>
                                        <span class="player-status">
                                            {player.ready ? "Ready" : "Not ready"}
                                        </span>
                                    </li>
                                )}
                            </For>
                        </ul>
                    </section>

                    <button
                        id="ready_button"
                        type="button"
                        classList={{ "is-ready": is_ready() }}
                        aria-label={is_ready() ? "Mark yourself not ready" : "Mark yourself ready"}
                        aria-pressed={is_ready()}
                        onClick={handle_ready_button}
                    >
                        <span>{is_ready() ? "READY!" : "READY?"}</span>
                    </button>
                </section>
            </section>
        </main>
    );
}

function handle_ready_button() {
    const next_state = !is_ready();
    set_is_ready(next_state);
    set_ready(next_state);
}
