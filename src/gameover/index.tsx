import { update } from "firebase/database";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { leave_room, players_joined, room_id, set_ready } from "../main";
import css from "./index.css?raw";

export default function Gameover() {
    const [ready_update_pending, set_ready_update_pending] = createSignal(true);
    const [status_message, set_status_message] = createSignal("");
    const leaderboard = createMemo(() =>
        [...players_joined()].sort((left, right) => {
            const score_difference = (right[1].score ?? 0) - (left[1].score ?? 0);
            return score_difference || left[1].name.localeCompare(right[1].name);
        })
    );
    const local_player = createMemo(() =>
        players_joined().find(([id]) => id === window.this_user_id)?.[1]
    );
    const ready_count = createMemo(() =>
        players_joined().filter(([, player]) => player.ready).length
    );
    const connected_count = createMemo(() => players_joined().length);
    const local_ready = createMemo(() => local_player()?.ready ?? false);
    const winner = createMemo(() => leaderboard()[0]?.[1]);

    onMount(async () => {
        try {
            const reset: Record<string, boolean> = {
                [`players/${window.this_user_id}/ready`]: false
            };

            if (window.room_snapshot.host === window.this_user_id) {
                reset.playing_now = false;
            }

            await update(window.room_reference, reset);
        } catch {
            set_status_message("Unable to prepare the rematch.");
        } finally {
            set_ready_update_pending(false);
        }
    });

    const toggle_ready = async () => {
        set_ready_update_pending(true);
        set_status_message("");

        try {
            await set_ready(!local_ready());
        } catch {
            set_status_message("Unable to update your ready status.");
        } finally {
            set_ready_update_pending(false);
        }
    };

    return (
        <main class="gameover-screen">
            <style>{css}</style>
            <div class="matrix-shade" aria-hidden="true" />

            <section class="gameover-content">
                <header class="gameover-header">
                    <p class="gameover-brand">PatchIt!</p>
                    <button
                        id="gameover-leave-button"
                        type="button"
                        onClick={leave_room}
                    >
                        Leave Lobby
                    </button>
                </header>

                <section class="gameover-heading" aria-labelledby="gameover-title">
                    <p>Match complete</p>
                    <h1 id="gameover-title">GAME OVER</h1>
                    <span>Lobby {room_id()}</span>
                </section>

                <section class="results-layout">
                    <section class="leaderboard-panel" aria-labelledby="leaderboard-title">
                        <header>
                            <div>
                                <p>Final standings</p>
                                <h2 id="leaderboard-title">Leaderboard</h2>
                            </div>
                            <span>{connected_count()} players</span>
                        </header>

                        <Show
                            when={winner()}
                            fallback={<p class="empty-results">No scores were recorded.</p>}
                        >
                            <section class="winner-card" aria-label="Match winner">
                                <span class="winner-label">Top debugger</span>
                                <strong>{winner()?.name}</strong>
                                <span>{winner()?.score ?? 0} points</span>
                            </section>
                        </Show>

                        <ol class="leaderboard-list">
                            <For each={leaderboard()}>
                                {([id, player], index) => (
                                    <li
                                        classList={{
                                            "is-local-player": id === window.this_user_id,
                                            "is-winner": index() === 0
                                        }}
                                    >
                                        <span class="player-rank">
                                            {String(index() + 1).padStart(2, "0")}
                                        </span>
                                        <span class="result-avatar">
                                            {player.name.slice(0, 1).toUpperCase()}
                                        </span>
                                        <span class="result-player">
                                            <strong>{player.name}</strong>
                                            <small>
                                                {id === window.this_user_id ? "You" : "Debugger"}
                                            </small>
                                        </span>
                                        <span class="result-score">
                                            <strong>{player.score ?? 0}</strong>
                                            <small>points</small>
                                        </span>
                                    </li>
                                )}
                            </For>
                        </ol>
                    </section>

                    <aside class="rematch-panel" aria-labelledby="rematch-title">
                        <header>
                            <p>Next round</p>
                            <h2 id="rematch-title">Play again?</h2>
                        </header>

                        <div class="ready-summary">
                            <span>Players ready</span>
                            <strong>
                                {ready_count()}/{connected_count()}
                            </strong>
                        </div>

                        <div class="ready-meter" aria-hidden="true">
                            <span
                                style={{
                                    width: connected_count()
                                        ? `${ready_count() / connected_count() * 100}%`
                                        : "0%"
                                }}
                            />
                        </div>

                        <ul class="ready-roster">
                            <For each={leaderboard()}>
                                {([id, player]) => (
                                    <li classList={{ "is-ready": player.ready }}>
                                        <span>{player.name}</span>
                                        <strong>
                                            {player.ready
                                                ? "Ready"
                                                : id === window.this_user_id
                                                  ? "Your choice"
                                                  : "Waiting"}
                                        </strong>
                                    </li>
                                )}
                            </For>
                        </ul>

                        <button
                            id="rematch-button"
                            type="button"
                            classList={{ "is-ready": local_ready() }}
                            disabled={ready_update_pending()}
                            aria-pressed={local_ready()}
                            onClick={toggle_ready}
                        >
                            <span>{local_ready() ? "Ready!" : "Play again"}</span>
                            <small>
                                {local_ready() ? "Click to cancel" : "Join the next match"}
                            </small>
                        </button>

                        <p class="rematch-note">
                            {status_message()
                                || (local_ready()
                                    ? "Waiting for every player to ready up."
                                    : "The next match starts when everyone is ready.")}
                        </p>
                    </aside>
                </section>
            </section>
        </main>
    );
}
