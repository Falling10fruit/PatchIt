import { createMemo, createSignal, For, Match, Switch } from "solid-js";
import { child, update } from "firebase/database";
import { Screens, set_current_screen } from "..";
import MatrixRain from "../components/MatrixRain";
import { players_joined, room_id, room_max_player_count } from "../main";
import loading_gif from "../play/loading.gif";
import css from "../play/index.css?raw";

const [still_loading, set_still_loading] = createSignal(true);
const [challenge, set_challenge] = createSignal<Challenge | null>(null);
const [current_code, set_current_code] = createSignal("");
let code_sync_interval: number | undefined;

const problem_filler = Array.from(
    { length: 8 },
    () =>
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer consequat, justo sed cursus feugiat, nisl augue tincidunt mauris, vitae volutpat neque arcu at erat. Suspendisse potenti, aliquam viverra lorem non, fermentum vulputate libero."
);

async function start_game() {
    set_current_screen(Screens.PLAY_SCREEN);
    set_still_loading(true);

    const generated_challenge = await generate_problem();
    update(window.room_reference, {
        playing_now: true,
        start_time: Date.now(),
        finish_time: Date.now() + 5 * 60 * 1000,
        challenge: generated_challenge
    } as Room);
}

import lorem_response from "../play/lorem_response.json";
const use_lorem = true;
async function generate_problem() {
    if (use_lorem) {
        console.warn("using lorem response");
        return lorem_response;
    }

    const response = await window.open_ai_client.responses.create({
        model: "gpt-5.4-mini",
        instructions: "You are the core engine of a JavaScript debugging game. Your primary task is to generate broken JavaScript code snippets for players to fix, along with automated test cases. RULES AND CONSTRAINTS: 1. Pure JavaScript Only: No HTML, CSS, DOM manipulation, or browser-specific APIs. Stick to core logic, math, array/object manipulation, algorithms, or async/await patterns. 2. Difficulty Scaling (1-100): The user will request a target difficulty. You must generate a challenge matching this scale and evaluate the final difficulty of your generated code. - 1-30 (Beginner): Simple syntax errors, typos, basic math/logic flaws, basic array iterations. - 31-70 (Intermediate): Scope issues, incorrect array methods, loose/strict equality, object mutation, variable shadowing. - 71-100 (Expert): Async/await handling, Promise chains, closure bugs, complex algorithms, prototype issues, or race conditions. 3. Fixable Bugs: Introduce 1 to 3 distinct bugs appropriate for the difficulty level. 4. Code Structure: The generated code MUST be a single function that returns a value, so it can be automatically tested. OUTPUT FORMAT: You must respond STRICTLY with a valid JSON object. Do not wrap the JSON in markdown formatting, and do not include any conversational text.",
        text: {
            format: {
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
                                required: ["input_args", "expected_output"],
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
            }
        },
        input: "Difficulty: " + window.difficulty
    });

    return JSON.parse(response.output_text) as Challenge;
}

function update_challenge() {
    const next_challenge = window.room_snapshot.challenge;
    if (!next_challenge) return;

    set_challenge(next_challenge);
    if (still_loading()) set_current_code(next_challenge.broken_code);
    set_still_loading(false);

    if (code_sync_interval === undefined) {
        code_sync_interval = window.setInterval(read_code, 1000);
    }
}

function read_code() {
    update(
        child(window.room_reference, `players/${window.this_user_id}/code`),
        current_code
    );
}

export default function PlayScreen() {
    return (
        <main class="play-screen">
            <style>{css}</style>
            <MatrixRain direction="center-outward" />
            <div class="matrix-shade" aria-hidden="true" />

            <Switch fallback={<LoadingScreen />}>
                <Match when={still_loading()}>
                    <LoadingScreen />
                </Match>
                <Match when={!still_loading()}>
                    <Showtime />
                </Match>
            </Switch>
        </main>
    );
}

function Showtime() {
    const other_players = createMemo(() =>
        players_joined().filter(([id]) => id !== window.this_user_id)
    );
    const player_slots = createMemo(() => {
        const players = other_players();
        const slot_count = Math.max(0, room_max_player_count() - 1, players.length);

        return Array.from({ length: slot_count }, (_, index) => players[index] ?? null);
    });
    const first_test_case = createMemo(() => challenge()?.test_cases[0]);

    return (
        <section class="player-workspace">
            <aside class="problem-panel play-panel" aria-labelledby="problem-title">
                <header class="timer-bar">
                    <span>Timer</span>
                    <strong>05:00</strong>
                </header>

                <div class="problem-content">
                    <p>Challenge {challenge()?.difficulty_score ?? "--"}</p>
                    <h1 id="problem-title">{challenge()?.title ?? "Debug the code"}</h1>
                    <p>{challenge()?.intended_behavior ?? "Challenge details unavailable."}</p>
                    <For each={problem_filler}>
                        {(paragraph) => <p>{paragraph}</p>}
                    </For>

                    <section class="test-case" aria-label="Example test case">
                        <span>Input</span>
                        <code>{first_test_case()?.input_args.join(", ") ?? "Unavailable"}</code>
                        <span>Expected</span>
                        <code>{first_test_case()?.expected_output ?? "Unavailable"}</code>
                    </section>
                </div>
            </aside>

            <section class="editor-stack">
                <section class="code-panel play-panel" aria-labelledby="code-title">
                    <header class="panel-header">
                        <h2 id="code-title">Code</h2>
                        <button type="button">Run code</button>
                    </header>
                    <textarea
                        id="code_editor"
                        aria-label="Code editor"
                        spellcheck={false}
                        wrap="off"
                        value={current_code()}
                        onInput={(event) => set_current_code(event.currentTarget.value)}
                    />
                </section>

                <section class="console-panel play-panel" aria-labelledby="console-title">
                    <header class="panel-header">
                        <h2 id="console-title">Console</h2>
                        <span>Ready</span>
                    </header>
                    <pre>Run your code to see test results.</pre>
                </section>
            </section>

            <aside class="players-code-panel" aria-labelledby="players-code-title">
                <header class="players-code-header">
                    <span id="players-code-title">Lobby</span>
                    <strong>{room_id() || "-----"}</strong>
                </header>

                <div class="players-code-scroll">
                    <For each={player_slots()}>
                        {(player, index) => (
                            <PlayerCodeCard player={player} index={index()} />
                        )}
                    </For>
                </div>
            </aside>
        </section>
    );
}

function PlayerCodeCard(props: {
    player: [string, Player] | null;
    index: number;
}) {
    if (!props.player) {
        return (
            <article class="player-code-card is-empty">
                <header>
                    <span>Open slot {props.index + 1}</span>
                    <i>Waiting</i>
                </header>
                <pre>Waiting for a player...</pre>
            </article>
        );
    }

    const player = props.player[1];

    return (
        <article class="player-code-card">
            <header>
                <span>{player.name}</span>
                <i>{player.ready ? "Debugging" : "Connecting"}</i>
            </header>
            <pre>{player.code || "Waiting for code..."}</pre>
        </article>
    );
}

function LoadingScreen() {
    return (
        <section class="loading-view">
            <h1>Challenge loading</h1>
            <img src={loading_gif} alt="Loading" />
        </section>
    );
}

export { start_game, update_challenge };
