import { createSignal, For, Match, Switch } from "solid-js";
import css from "../play/index.css?raw"
import { Screens, set_current_screen } from "..";
import { child, update } from "firebase/database";
import loading_gif from "../play/loading.gif"
import { players_joined } from "../main";

const [still_loading, set_still_loading] = createSignal(true);
const [problem_description, set_problem_description] = createSignal("");
const [current_code, set_current_code] = createSignal("");

async function start_game() {
    set_current_screen(Screens.PLAY_SCREEN);
    set_still_loading(true);

    const challenge = await generate_problem();
    update(window.room_reference, {
        playing_now: true,
        start_time: Date.now(),
        finish_time: Date.now() + 5 * 60 * 1000,
        challenge: challenge
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
        instructions: 'You are the core engine of a JavaScript debugging game. Your primary task is to generate broken JavaScript code snippets for players to fix, along with automated test cases. RULES AND CONSTRAINTS: 1. Pure JavaScript Only: No HTML, CSS, DOM manipulation, or browser-specific APIs. Stick to core logic, math, array/object manipulation, algorithms, or async/await patterns. 2. Difficulty Scaling (1-100): The user will request a target difficulty. You must generate a challenge matching this scale and evaluate the final difficulty of your generated code. - 1-30 (Beginner): Simple syntax errors, typos, basic math/logic flaws, basic array iterations. - 31-70 (Intermediate): Scope issues, incorrect array methods, loose/strict equality, object mutation, variable shadowing. - 71-100 (Expert): Async/await handling, Promise chains, closure bugs, complex algorithms, prototype issues, or race conditions. 3. Fixable Bugs: Introduce 1 to 3 distinct bugs appropriate for the difficulty level. 4. Code Structure: The generated code MUST be a single function that returns a value, so it can be automatically tested. OUTPUT FORMAT: You must respond STRICTLY with a valid JSON object. Do not wrap the JSON in markdown formatting (like ```json), and do not include any conversational text.',
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
    }); return JSON.parse(response.output_text) as Challenge;
}

function update_challenge() {
    set_problem_description(window.room_snapshot.challenge.intended_behavior);
    set_current_code(window.room_snapshot.challenge.broken_code);
    set_still_loading(false);

    setInterval(read_code, 1000);
} function read_code() { update(child(window.room_reference, `players/${window.this_user_id}`), { code: current_code() }); }

export default function PlayScreen () {
    return ( <main>
        <style>{css}</style>

        <Switch fallback={<LoadingScreen />}>
            <Match when={still_loading()}><LoadingScreen /></Match>
            <Match when={!still_loading()}><Showtime /></Match>
        </Switch>
    </main> );
}

function Showtime() {
    return (<section id="main_coding_view">
        <div id="problem">{ problem_description() }</div>
        <textarea id="coding_area" oninput={
            (e) => { set_current_code(e.target.value); }
        } />
        

        <div id="other_people">
            <For each={players_joined()}>
                { (player) => {
                    if (player[0] != window.this_user_id) return (<article>
                        <p> {player[1].name} </p>
                        <br />{ player[1].code }
                    </article>)
                } }
            </For>
        </div>
    </section>);
}

function LoadingScreen() {
    return (<section id="loading_view">
        <h1>challenge loading</h1>
        <img src={loading_gif} alt="loading gif"/>
    </section>);
}

export { start_game, update_challenge }