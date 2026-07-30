import { createEffect, createMemo, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js";
import { child, runTransaction, update } from "firebase/database";
import { Screens, set_current_screen } from "..";
import MatrixRain from "../components/MatrixRain";
import {
    challenge_difficulty,
    players_joined,
    room_id,
    room_max_player_count
} from "../main";
import challenge_templates from "../play/challenges.json";
import loading_gif from "../play/loading.gif";
import css from "../play/index.css?raw";

const [still_loading, set_still_loading] = createSignal(true);
const [challenge, set_challenge] = createSignal<Challenge | null>(null);
const [current_code, set_current_code] = createSignal("");
const [time_left, set_time_left] = createSignal(0);
const [match_finished, set_match_finished] = createSignal(false);
let game_tick_interval: number | undefined;
let is_starting_game = false;

const INITIAL_POOL_SIZE = 6;
const REFILL_BATCH_SIZE = 4;
const REFILL_THRESHOLD = 3;
const AI_GENERATION_MAX_ATTEMPTS = 3;
const CHALLENGE_VALIDATION_TIMEOUT_MS = 2500;
const MATCH_DURATION_MS = 5 * 60 * 1000;
const AI_MODEL = "openai/gpt-oss-120b";
const use_local_challenges = (
    import.meta.env.VITE_USE_LOCAL_CHALLENGES !== "false"
);

async function start_game() {
    if (is_starting_game || window.room_snapshot?.playing_now) return;

    is_starting_game = true;
    set_current_screen(Screens.PLAY_SCREEN);
    set_still_loading(true);
    set_challenge(null);
    set_current_code("");
    set_match_finished(false);
    stop_game_tick();

    try {
        const challenge_pool = await generate_challenge_batch(0, INITIAL_POOL_SIZE);
        const start_time = Date.now();
        const player_resets: Record<string, string | number | boolean> = {};

        for (const player_id of Object.keys(window.room_snapshot.players ?? {})) {
            player_resets[`players/${player_id}/ready`] = false;
            player_resets[`players/${player_id}/code`] = "";
            player_resets[`players/${player_id}/challenge_index`] = 0;
            player_resets[`players/${player_id}/score`] = 0;
            player_resets[`players/${player_id}/last_completed_at`] = 0;
        }

        await update(window.room_reference, {
            playing_now: true,
            start_time,
            finish_time: start_time + MATCH_DURATION_MS,
            challenge_pool,
            generation_status: "idle",
            ...player_resets
        });
    } finally {
        is_starting_game = false;
    }
}

function build_local_challenge_batch(start_index: number, count: number) {
    return Array.from({ length: count }, (_, offset) => {
        const pool_index = start_index + offset;
        const template = challenge_templates[
            pool_index % challenge_templates.length
        ] as Challenge;

        return {
            ...template,
            id: `${template.id}-${pool_index + 1}`,
            test_cases: template.test_cases.map((test_case) => ({
                input_args: [...test_case.input_args],
                expected_output: test_case.expected_output
            }))
        };
    });
}

async function generate_challenge_batch(start_index: number, count: number) {
    if (use_local_challenges) {
        return build_local_challenge_batch(start_index, count);
    }

    const generated_challenges: Challenge[] = [];
    for (let offset = 0; offset < count; offset++) {
        generated_challenges.push(await generate_problem(start_index + offset));
    }
    return generated_challenges;
}

function normalize_difficulty(value: number) {
    return Math.min(100, Math.max(1, Math.round(value)));
}

function assert_generated_challenge_shape(
    value: unknown
): asserts value is Omit<Challenge, "id"> {
    if (!value || typeof value !== "object") {
        throw new Error("The generated challenge is not an object.");
    }

    const candidate = value as Partial<Omit<Challenge, "id">>;
    const required_text = [
        ["title", candidate.title],
        ["function_name", candidate.function_name],
        ["intended_behavior", candidate.intended_behavior],
        ["broken_code", candidate.broken_code],
        ["solution_code", candidate.solution_code]
    ] as const;

    for (const [field, field_value] of required_text) {
        if (typeof field_value !== "string" || field_value.trim() === "") {
            throw new Error(`Generated ${field} must be a non-empty string.`);
        }
    }

    if (!/^[A-Za-z_$][\w$]*$/.test(candidate.function_name!)) {
        throw new Error("The generated function name is invalid.");
    }

    if (candidate.broken_code === candidate.solution_code) {
        throw new Error("The broken code and solution code are identical.");
    }

    if (
        typeof candidate.difficulty_score !== "number"
        || !Number.isFinite(candidate.difficulty_score)
        || candidate.difficulty_score < 1
        || candidate.difficulty_score > 100
    ) {
        throw new Error("Generated difficulty must be between 1 and 100.");
    }

    if (
        !Array.isArray(candidate.test_cases)
        || candidate.test_cases.length < 3
        || candidate.test_cases.length > 6
    ) {
        throw new Error("A generated challenge must have 3 to 6 test cases.");
    }

    candidate.test_cases.forEach((test_case, test_index) => {
        if (!test_case || !Array.isArray(test_case.input_args)) {
            throw new Error(`Test case ${test_index + 1} has invalid arguments.`);
        }

        test_case.input_args.forEach((input_arg, argument_index) => {
            if (typeof input_arg !== "string") {
                throw new Error(
                    `Test case ${test_index + 1}, argument ${argument_index + 1} must be a string.`
                );
            }

            try {
                JSON.parse(input_arg);
            } catch {
                throw new Error(
                    `Test case ${test_index + 1}, argument ${argument_index + 1} is not valid JSON.`
                );
            }
        });

        if (typeof test_case.expected_output !== "string") {
            throw new Error(
                `Test case ${test_index + 1} expected output must be a string.`
            );
        }

        try {
            JSON.parse(test_case.expected_output);
        } catch {
            throw new Error(
                `Test case ${test_index + 1} expected output is not valid JSON.`
            );
        }
    });
}

type ValidationExecution =
    | { results: TestResult[]; error?: never }
    | { results?: never; error: string };

function execute_for_generation_validation(
    code: string,
    generated_challenge: Challenge
) {
    return new Promise<ValidationExecution>((resolve) => {
        let worker: Worker;
        let timeout: number | undefined;
        let finished = false;

        const finish = (result: ValidationExecution) => {
            if (finished) return;
            finished = true;
            if (timeout !== undefined) window.clearTimeout(timeout);
            worker?.terminate();
            resolve(result);
        };

        try {
            worker = create_execution_worker(code, generated_challenge);
        } catch (error) {
            resolve({
                error: error instanceof Error
                    ? error.message
                    : "Unable to start challenge validation."
            });
            return;
        }

        worker.onmessage = (event: MessageEvent<WorkerOutput>) => {
            if (event.data.type === "test_results") {
                finish({ results: event.data.results });
            } else if (event.data.type === "error") {
                finish({ error: event.data.message });
            }
        };

        worker.onerror = (event) => {
            event.preventDefault();
            finish({ error: event.message || "Challenge validation failed." });
        };

        timeout = window.setTimeout(() => {
            finish({ error: "Challenge validation timed out." });
        }, CHALLENGE_VALIDATION_TIMEOUT_MS);
    });
}

async function validate_generated_challenge(generated_challenge: Challenge) {
    const solution_execution = await execute_for_generation_validation(
        generated_challenge.solution_code,
        generated_challenge
    );
    if ("error" in solution_execution) {
        throw new Error(`Generated solution failed to run: ${solution_execution.error}`);
    }

    const solution_passes = (
        solution_execution.results.length === generated_challenge.test_cases.length
        && solution_execution.results.every((result) => result.passed)
    );
    if (!solution_passes) {
        throw new Error("Generated solution does not pass every test case.");
    }

    const broken_execution = await execute_for_generation_validation(
        generated_challenge.broken_code,
        generated_challenge
    );
    const broken_code_fails = (
        "error" in broken_execution
        || broken_execution.results.some((result) => !result.passed)
    );
    if (!broken_code_fails) {
        throw new Error("Generated broken code passes every test case.");
    }
}

async function request_generated_problem(
    pool_index: number,
    target_difficulty: number
) {
    const response = await window.open_ai_client.chat.completions.create({
        model: AI_MODEL,
        temperature: 0.6,
        reasoning_effort: "low",
        messages: [
            {
                role: "system",
                content: "You are the core engine of a JavaScript debugging game. Generate broken JavaScript code for players to fix, a correct solution, and automated test cases. RULES: 1. Use pure JavaScript only. Do not use HTML, CSS, DOM manipulation, browser APIs, imports, packages, or external dependencies. 2. Match the requested difficulty from 1 to 100: 1-30 beginner syntax/basic logic, 31-70 intermediate scope/array/object bugs, and 71-100 expert async/closure/algorithm bugs. 3. Introduce 1 to 3 fixable bugs. The broken code must fail at least one supplied test. 4. Both broken_code and solution_code must define one function using the exact function_name. The solution must pass every supplied test. 5. Generate 3 to 6 test cases. Every input_args item and expected_output must be a string containing valid JSON accepted by JSON.parse."
            },
            {
                role: "user",
                content: `Target difficulty: ${target_difficulty} out of 100.`
            }
        ],
        response_format: {
            type: "json_schema",
            json_schema: {
                name: "coding_challenge",
                strict: true,
                schema: {
                    type: "object",
                    properties: {
                        title: { type: "string" },
                        function_name: { type: "string" },
                        intended_behavior: { type: "string" },
                        broken_code: { type: "string" },
                        solution_code: { type: "string" },
                        difficulty_score: { type: "number" },
                        test_cases: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    input_args: {
                                        type: "array",
                                        items: { type: "string" }
                                    },
                                    expected_output: { type: "string" }
                                },
                                required: ["input_args", "expected_output"],
                                additionalProperties: false
                            }
                        }
                    },
                    required: [
                        "title",
                        "function_name",
                        "intended_behavior",
                        "broken_code",
                        "solution_code",
                        "difficulty_score",
                        "test_cases"
                    ],
                    additionalProperties: false
                }
            }
        }
    });

    const choice = response.choices[0];
    if (!choice || choice.finish_reason !== "stop") {
        throw new Error(
            `AI response ended with reason "${choice?.finish_reason ?? "missing"}".`
        );
    }
    if (!choice.message.content) {
        throw new Error("AI response did not contain a generated challenge.");
    }

    const generated_value: unknown = JSON.parse(choice.message.content);
    assert_generated_challenge_shape(generated_value);

    const generated_challenge: Challenge = {
        ...generated_value,
        id: `ai-challenge-${pool_index + 1}`
    };
    await validate_generated_challenge(generated_challenge);
    return generated_challenge;
}

async function generate_problem(pool_index: number) {
    const target_difficulty = normalize_difficulty(challenge_difficulty());
    let latest_error: unknown;

    for (let attempt = 1; attempt <= AI_GENERATION_MAX_ATTEMPTS; attempt++) {
        try {
            return await request_generated_problem(pool_index, target_difficulty);
        } catch (error) {
            latest_error = error;
            console.warn(
                `Challenge ${pool_index + 1} generation attempt ${attempt} failed:`,
                error
            );
        }
    }

    const reason = latest_error instanceof Error
        ? latest_error.message
        : "Unknown generation error.";
    throw new Error(
        `Unable to generate a valid challenge after ${AI_GENERATION_MAX_ATTEMPTS} attempts: ${reason}`
    );
}

function update_challenge() {
    const player = window.room_snapshot.players?.[window.this_user_id];
    const challenge_index = player?.challenge_index ?? 0;
    const next_challenge = window.room_snapshot.challenge_pool?.[challenge_index];
    if (!player || !next_challenge) return;

    const challenge_changed = challenge()?.id !== next_challenge.id;
    set_challenge(next_challenge);
    if (challenge_changed) {
        set_current_code(player.code || next_challenge.broken_code);
    }
    set_still_loading(false);
    update_time_left();

    if (game_tick_interval === undefined) {
        game_tick_interval = window.setInterval(game_tick, 1000);
    }
}

function game_tick() {
    update_time_left();
    if (match_finished()) {
        stop_game_tick();
        set_current_screen(Screens.GAMEOVER_SCREEN);
        return;
    }

    update(child(window.room_reference, `players/${window.this_user_id}`), { code: current_code() });
}

function update_time_left() {
    const remaining_seconds = Math.ceil(
        (window.room_snapshot.finish_time - Date.now()) / 1000
    );
    set_time_left(Math.max(0, remaining_seconds));
    set_match_finished(remaining_seconds <= 0);
}

function stop_game_tick() {
    if (game_tick_interval !== undefined) {
        window.clearInterval(game_tick_interval);
        game_tick_interval = undefined;
    }
}

async function ensure_pool_capacity(next_challenge_index: number) {
    const pool_reference = child(window.room_reference, "challenge_pool");

    if (!use_local_challenges) {
        const current_pool = window.room_snapshot.challenge_pool ?? [];
        const challenges_remaining = current_pool.length - next_challenge_index;
        if (challenges_remaining > REFILL_THRESHOLD) return current_pool;

        const generation_reference = child(
            window.room_reference,
            "generation_status"
        );
        const generation_lock = await runTransaction(
            generation_reference,
            (status) => status === "generating" ? undefined : "generating"
        );

        if (!generation_lock.committed) {
            return current_pool;
        }

        try {
            const generated_batch = await generate_challenge_batch(
                current_pool.length,
                REFILL_BATCH_SIZE
            );
            const pool_transaction = await runTransaction(
                pool_reference,
                (stored_pool) => {
                    const latest_pool = Array.isArray(stored_pool)
                        ? stored_pool as Challenge[]
                        : [];
                    const latest_remaining = (
                        latest_pool.length - next_challenge_index
                    );

                    if (latest_remaining > REFILL_THRESHOLD) {
                        return latest_pool;
                    }

                    return [...latest_pool, ...generated_batch];
                }
            );
            return (pool_transaction.snapshot.val() ?? []) as Challenge[];
        } finally {
            await update(window.room_reference, {
                generation_status: "idle"
            });
        }
    }

    const transaction = await runTransaction(pool_reference, (stored_pool) => {
        const current_pool = Array.isArray(stored_pool)
            ? stored_pool as Challenge[]
            : [];
        const challenges_remaining = current_pool.length - next_challenge_index;

        if (challenges_remaining > REFILL_THRESHOLD) {
            return current_pool;
        }

        return [
            ...current_pool,
            ...build_local_challenge_batch(
                current_pool.length,
                REFILL_BATCH_SIZE
            )
        ];
    });

    return (transaction.snapshot.val() ?? []) as Challenge[];
}

async function advance_player_after_pass(passed_challenge: Challenge) {
    if (match_finished() || Date.now() >= window.room_snapshot.finish_time) {
        return { advanced: false, reason: "The match timer has ended." };
    }

    const snapshot_player = window.room_snapshot.players?.[window.this_user_id];
    if (!snapshot_player) {
        return { advanced: false, reason: "Player data is unavailable." };
    }

    const current_challenge_index = snapshot_player.challenge_index ?? 0;
    const expected_challenge = window.room_snapshot.challenge_pool?.[
        current_challenge_index
    ];
    if (expected_challenge?.id !== passed_challenge.id) {
        return {
            advanced: false,
            reason: "This challenge was already completed in another update."
        };
    }

    const next_challenge_index = current_challenge_index + 1;
    const updated_pool = await ensure_pool_capacity(next_challenge_index);
    const next_challenge = updated_pool[next_challenge_index];
    if (!next_challenge) {
        return { advanced: false, reason: "The next challenge is still loading." };
    }

    const player_reference = child(
        window.room_reference,
        `players/${window.this_user_id}`
    );
    const transaction = await runTransaction(
        player_reference,
        (stored_player: Player | null) => {
            if (!stored_player) return;

            const stored_challenge_index = stored_player.challenge_index ?? 0;
            if (stored_challenge_index !== current_challenge_index) return;

            return {
                ...stored_player,
                challenge_index: next_challenge_index,
                score: (stored_player.score ?? 0) + 1,
                last_completed_at: Date.now(),
                code: next_challenge.broken_code
            };
        }
    );

    if (!transaction.committed) {
        return {
            advanced: false,
            reason: "This challenge was already scored."
        };
    }

    return {
        advanced: true,
        next_challenge
    };
}

function handle_code_key_down(event: KeyboardEvent) {
    if (event.key !== "Tab") return;

    event.preventDefault();
    const editor = event.currentTarget as HTMLTextAreaElement;
    const code = current_code();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const indentation = "    ";

    if (start === end) {
        set_current_code(
            code.slice(0, start) + indentation + code.slice(end)
        );
        queueMicrotask(() => {
            editor.selectionStart = start + indentation.length;
            editor.selectionEnd = start + indentation.length;
        });
        return;
    }

    const line_start = code.lastIndexOf("\n", start - 1) + 1;
    const line_end_index = code.indexOf("\n", end);
    const line_end = line_end_index === -1 ? code.length : line_end_index;
    const selected_lines = code.slice(line_start, line_end);
    const line_count = selected_lines.split("\n").length;
    const indented_lines = indentation + selected_lines.replace(
        /\n/g,
        `\n${indentation}`
    );

    set_current_code(
        code.slice(0, line_start) + indented_lines + code.slice(line_end)
    );
    queueMicrotask(() => {
        editor.selectionStart = start + indentation.length;
        editor.selectionEnd = end + indentation.length * line_count;
    });
}

type SyntaxToken = {
    value: string;
    kind: string;
    start: number;
    end: number;
};

type InlineError = {
    line: number;
    column: number;
};

type ConsoleLevel = "log" | "info" | "warn" | "error" | "system";

type ConsoleEntry = {
    level: ConsoleLevel;
    text: string;
};

type TestResult = {
    index: number;
    passed: boolean;
    actual: string;
    expected: string;
    error?: string;
};

type WorkerOutput =
    | { type: "console"; level: Exclude<ConsoleLevel, "system">; text: string }
    | { type: "clear" }
    | { type: "test_results"; results: TestResult[] }
    | { type: "error"; message: string };

const javascript_keywords = new Set([
    "async",
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "default",
    "delete",
    "do",
    "else",
    "export",
    "extends",
    "finally",
    "for",
    "from",
    "function",
    "if",
    "import",
    "in",
    "instanceof",
    "let",
    "new",
    "of",
    "return",
    "static",
    "switch",
    "throw",
    "try",
    "typeof",
    "var",
    "while",
    "yield"
]);

const javascript_literals = new Set([
    "false",
    "null",
    "true",
    "undefined"
]);

function syntax_kind(value: string, line: string, end: number) {
    if (value.startsWith("//")) return "syntax-comment";
    if (/^["'`]/.test(value)) return "syntax-string";
    if (/^\d/.test(value)) return "syntax-number";
    if (javascript_keywords.has(value)) return "syntax-keyword";
    if (javascript_literals.has(value)) return "syntax-literal";
    if (/^[=+\-*/%<>!]/.test(value)) return "syntax-operator";
    if (line.slice(end).trimStart().startsWith("(")) return "syntax-function";
    return "syntax-plain";
}

function tokenize_code_line(line: string) {
    const pattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b|===|!==|=>|==|!=|<=|>=|[=+\-*/%<>!])/g;
    const tokens: SyntaxToken[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(line)) !== null) {
        if (match.index > cursor) {
            tokens.push({
                value: line.slice(cursor, match.index),
                kind: "syntax-plain",
                start: cursor,
                end: match.index
            });
        }

        const value = match[0];
        const end = match.index + value.length;
        tokens.push({
            value,
            kind: syntax_kind(value, line, end),
            start: match.index,
            end
        });
        cursor = end;
    }

    if (cursor < line.length) {
        tokens.push({
            value: line.slice(cursor),
            kind: "syntax-plain",
            start: cursor,
            end: line.length
        });
    }

    return tokens;
}

function locate_inline_error(code: string): InlineError | null {
    const lines = code.split("\n");

    for (let line_index = 0; line_index < lines.length; line_index++) {
        const line = lines[line_index];
        const arrow = line.indexOf("=>");
        if (arrow === -1) continue;

        for (let column = arrow + 2; column < line.length; column++) {
            if (line[column] !== "=") continue;

            const previous = line[column - 1] ?? "";
            const next = line[column + 1] ?? "";
            if (!"=!<>".includes(previous) && next !== "=" && next !== ">") {
                return { line: line_index, column };
            }
        }
    }

    return null;
}

function format_time(seconds: number) {
    const safe_seconds = Math.max(0, seconds);
    const minutes = Math.floor(safe_seconds / 60);
    const remaining_seconds = safe_seconds % 60;
    return `${minutes}:${String(remaining_seconds).padStart(2, "0")}`;
}

function create_execution_worker(code: string, active_challenge: Challenge) {
    if (!/^[A-Za-z_$][\w$]*$/.test(active_challenge.function_name)) {
        throw new Error("Challenge has an invalid function name.");
    }

    const worker_source = `
const formatValue = (value) => {
    if (typeof value === "string") return value;
    if (typeof value === "undefined") return "undefined";
    if (typeof value === "function") return value.toString();
    if (value instanceof Error) return value.name + ": " + value.message;
    try {
        const serialized = JSON.stringify(value);
        return serialized === undefined ? String(value) : serialized;
    } catch {
        return String(value);
    }
};
const send = (level, values) => {
    self.postMessage({
        type: "console",
        level,
        text: values.map(formatValue).join(" ")
    });
};
self.console.log = (...values) => send("log", values);
self.console.info = (...values) => send("info", values);
self.console.warn = (...values) => send("warn", values);
self.console.error = (...values) => send("error", values);
self.console.clear = () => self.postMessage({ type: "clear" });
const userCode = ${JSON.stringify(code)};
const functionName = ${JSON.stringify(active_challenge.function_name)};
const testCases = ${JSON.stringify(active_challenge.test_cases)};

const deepEqual = (left, right) => {
    if (Object.is(left, right)) return true;
    if (Array.isArray(left) && Array.isArray(right)) {
        return left.length === right.length
            && left.every((value, index) => deepEqual(value, right[index]));
    }
    if (
        left !== null
        && right !== null
        && typeof left === "object"
        && typeof right === "object"
    ) {
        const leftKeys = Object.keys(left);
        const rightKeys = Object.keys(right);
        return leftKeys.length === rightKeys.length
            && leftKeys.every(
                (key) => Object.prototype.hasOwnProperty.call(right, key)
                    && deepEqual(left[key], right[key])
            );
    }
    return false;
};

const parseTestValue = (encodedValue, label) => {
    try {
        return JSON.parse(encodedValue);
    } catch {
        throw new Error(label + " is not valid JSON: " + encodedValue);
    }
};

try {
    const createSolution = new Function(
        userCode
        + "\\n; return typeof "
        + functionName
        + " === \\"function\\" ? "
        + functionName
        + " : undefined;"
    );
    const solution = createSolution();
    if (typeof solution !== "function") {
        throw new Error(
            "Expected a function named "
            + functionName
            + ". Keep that function name in your solution."
        );
    }

    Promise.resolve().then(async () => {
        const results = [];
        for (let index = 0; index < testCases.length; index++) {
            const testCase = testCases[index];
            let expected;
            try {
                const inputArgs = testCase.input_args.map(
                    (value, argumentIndex) => parseTestValue(
                        value,
                        "Case " + (index + 1) + " argument " + (argumentIndex + 1)
                    )
                );
                expected = parseTestValue(
                    testCase.expected_output,
                    "Case " + (index + 1) + " expected output"
                );
                const actual = await solution(...inputArgs);
                results.push({
                    index,
                    passed: deepEqual(actual, expected),
                    actual: formatValue(actual),
                    expected: formatValue(expected)
                });
            } catch (error) {
                results.push({
                    index,
                    passed: false,
                    actual: "Error",
                    expected: formatValue(expected),
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
        self.postMessage({ type: "test_results", results });
    })
        .catch((error) => self.postMessage({
            type: "error",
            message: error instanceof Error
                ? error.name + ": " + error.message
                : String(error)
        }));
} catch (error) {
    self.postMessage({
        type: "error",
        message: error instanceof Error
            ? error.name + ": " + error.message
            : String(error)
    });
}
`;
    const worker_url = URL.createObjectURL(
        new Blob([worker_source], { type: "text/javascript" })
    );
    const worker = new Worker(worker_url);
    URL.revokeObjectURL(worker_url);
    return worker;
}

export default function PlayScreen() {
    onCleanup(stop_game_tick);

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
    const [editor_split, set_editor_split] = createSignal(66);
    const [is_resizing, set_is_resizing] = createSignal(false);
    const [is_advancing, set_is_advancing] = createSignal(false);
    const [active_output, set_active_output] = createSignal<"testcase" | "console">("testcase");
    const [active_test_case, set_active_test_case] = createSignal(0);
    const [inline_error, set_inline_error] = createSignal<InlineError | null>(null);
    const [console_entries, set_console_entries] = createSignal<ConsoleEntry[]>([]);
    const [console_status, set_console_status] = createSignal("Ready");
    const [test_results, set_test_results] = createSignal<TestResult[]>([]);
    let syntax_layer!: HTMLPreElement;
    let editor_gutter!: HTMLDivElement;
    let console_output!: HTMLDivElement;
    let active_worker: Worker | undefined;
    let execution_timeout: number | undefined;
    let previous_challenge_id = challenge()?.id;

    const other_players = createMemo(() =>
        players_joined().filter(([id]) => id !== window.this_user_id)
    );
    const local_player = createMemo(
        () => players_joined()
            .find(([id]) => id === window.this_user_id)?.[1]
    );
    const player_slots = createMemo(() => {
        const players = other_players();
        const slot_count = Math.max(0, room_max_player_count() - 1, players.length);

        return Array.from({ length: slot_count }, (_, index) => players[index] ?? null);
    });
    const first_test_case = createMemo(() => challenge()?.test_cases[0]);
    const test_cases = createMemo(() => challenge()?.test_cases ?? []);
    const selected_test_case = createMemo(
        () => test_cases()[active_test_case()] ?? test_cases()[0] ?? null
    );
    const selected_test_result = createMemo(
        () => test_results()[active_test_case()] ?? null
    );
    const code_lines = createMemo(() => current_code().split("\n"));

    createEffect(() => {
        const current_challenge_id = challenge()?.id;
        if (!current_challenge_id || current_challenge_id === previous_challenge_id) return;

        previous_challenge_id = current_challenge_id;
        set_active_test_case(0);
        set_test_results([]);
        set_inline_error(null);
        set_console_entries([]);
        set_console_status("Ready");
        set_is_advancing(false);
    });

    const resize_editor = (event: PointerEvent) => {
        if (!is_resizing()) return;

        const divider = event.currentTarget;
        if (!(divider instanceof HTMLElement)) return;

        const surface = divider.closest(".coding-surface");
        if (!(surface instanceof HTMLElement)) return;

        const bounds = surface.getBoundingClientRect();
        const titlebar = surface.querySelector(".editor-titlebar");
        const titlebar_height = titlebar instanceof HTMLElement
            ? titlebar.getBoundingClientRect().height
            : 0;
        const available_height = Math.max(1, bounds.height - titlebar_height);
        const position = event.clientY - bounds.top - titlebar_height;
        const next_split = position / available_height * 100;
        set_editor_split(Math.min(78, Math.max(40, next_split)));
    };

    const stop_execution = () => {
        if (active_worker !== undefined) {
            active_worker.terminate();
            active_worker = undefined;
        }

        if (execution_timeout !== undefined) {
            window.clearTimeout(execution_timeout);
            execution_timeout = undefined;
        }
    };

    const append_console = (entry: ConsoleEntry) => {
        set_console_entries((entries) => [...entries, entry]);
        queueMicrotask(() => {
            if (console_output) console_output.scrollTop = console_output.scrollHeight;
        });
    };

    const run_code = () => {
        const active_challenge = challenge();
        if (!active_challenge || is_advancing() || match_finished()) return;

        stop_execution();
        set_active_output("console");
        set_inline_error(null);
        set_test_results([]);
        set_console_entries([{ level: "system", text: "Running solution.js" }]);
        set_console_status("Running");

        try {
            active_worker = create_execution_worker(current_code(), active_challenge);
        } catch (error) {
            set_console_status("Error");
            append_console({
                level: "error",
                text: error instanceof Error ? error.message : "Unable to start runner"
            });
            return;
        }

        active_worker.onmessage = async (event: MessageEvent<WorkerOutput>) => {
            const output = event.data;

            if (output.type === "console") {
                append_console({ level: output.level, text: output.text });
                return;
            }

            if (output.type === "clear") {
                set_console_entries([]);
                return;
            }

            if (output.type === "error") {
                set_inline_error(locate_inline_error(current_code()) ?? { line: 0, column: 0 });
                set_console_status("Error");
                append_console({ level: "error", text: output.message });
                stop_execution();
                return;
            }

            stop_execution();
            set_test_results(output.results);
            set_active_output("testcase");

            const passed_count = output.results.filter((result) => result.passed).length;
            const all_tests_passed = (
                output.results.length > 0
                && passed_count === output.results.length
            );

            if (!all_tests_passed) {
                set_console_status(`${passed_count}/${output.results.length} passed`);
                append_console({
                    level: "system",
                    text: `${passed_count} of ${output.results.length} tests passed`
                });
                return;
            }

            set_is_advancing(true);
            set_console_status("All tests passed");
            append_console({
                level: "system",
                text: "All tests passed. Scoring challenge..."
            });

            try {
                const advancement = await advance_player_after_pass(active_challenge);
                if (!advancement.advanced) {
                    set_console_status("Not scored");
                    append_console({
                        level: "warn",
                        text: advancement.reason ?? "Challenge could not be scored."
                    });
                    return;
                }

                set_console_status("+1 point");
                append_console({
                    level: "system",
                    text: "Challenge complete: +1 point"
                });
            } catch (error) {
                set_console_status("Sync error");
                append_console({
                    level: "error",
                    text: error instanceof Error
                        ? error.message
                        : "Unable to load the next challenge."
                });
            } finally {
                set_is_advancing(false);
            }
        };

        active_worker.onerror = (event) => {
            event.preventDefault();
            set_inline_error(locate_inline_error(current_code()) ?? { line: 0, column: 0 });
            set_console_status("Error");
            set_is_advancing(false);
            append_console({ level: "error", text: event.message || "Execution failed" });
            stop_execution();
        };

        execution_timeout = window.setTimeout(() => {
            set_console_status("Stopped");
            set_is_advancing(false);
            append_console({ level: "error", text: "Execution stopped after 2.5 seconds" });
            stop_execution();
        }, 2500);
    };

    onCleanup(stop_execution);

    return (
        <section class="player-workspace">
            <aside class="problem-panel play-panel" aria-labelledby="problem-title">
                <header class="timer-bar">
                    <span>Timer</span>
                    <strong>{format_time(time_left())}</strong>
                </header>
                <output
                    class="score-tab"
                    aria-label={`Your score: ${local_player()?.score ?? 0}`}
                    title="Your score"
                >
                    {local_player()?.score ?? 0}
                </output>

                <div class="problem-content">
                    <div class="challenge-status-row">
                        <p>
                            Challenge {(local_player()?.challenge_index ?? 0) + 1}
                            {" · "}
                            Difficulty {challenge()?.difficulty_score ?? "--"}
                        </p>
                    </div>
                    <h1 id="problem-title">{challenge()?.title ?? "Debug the code"}</h1>
                    <p>{challenge()?.intended_behavior ?? "Challenge details unavailable."}</p>

                    <section class="test-case" aria-label="Example test case">
                        <span>Input</span>
                        <code>{first_test_case()?.input_args.join(", ") ?? "Unavailable"}</code>
                        <span>Expected</span>
                        <code>{first_test_case()?.expected_output ?? "Unavailable"}</code>
                    </section>
                </div>
            </aside>

            <section
                class="coding-surface play-panel"
                classList={{ "is-resizing": is_resizing() }}
                aria-labelledby="code-title"
                style={{
                    "grid-template-rows": `auto minmax(10rem, ${editor_split()}fr) 0.65rem minmax(7rem, ${100 - editor_split()}fr)`
                }}
            >
                <header class="editor-titlebar">
                    <div class="file-tabs">
                        <button type="button" class="file-tab is-active">
                            <span>JS</span>
                            <strong id="code-title">solution.js</strong>
                            <i aria-hidden="true" />
                        </button>
                    </div>
                    <div class="editor-actions">
                        <span class="problem-indicator">
                            <i
                                aria-hidden="true"
                                classList={{ "has-error": inline_error() !== null }}
                            />
                            {inline_error() ? "1 problem" : "No problems"}
                        </span>
                        <button
                            type="button"
                            onClick={run_code}
                            disabled={is_advancing() || match_finished()}
                        >
                            {match_finished()
                                ? "Time expired"
                                : is_advancing()
                                    ? "Loading next..."
                                    : "Run tests"}
                        </button>
                    </div>
                </header>

                <section class="editor-pane">
                    <div class="editor-gutter" ref={editor_gutter} aria-hidden="true">
                        <For each={code_lines()}>
                            {(_, index) => (
                                <span classList={{ "has-error": inline_error()?.line === index() }}>
                                    <i />
                                    <b>{index() + 1}</b>
                                </span>
                            )}
                        </For>
                    </div>

                    <div class="editor-code-area">
                        <pre class="syntax-layer" ref={syntax_layer} aria-hidden="true">
                            <code>
                                <For each={code_lines()}>
                                    {(line, line_index) => (
                                        <span class="syntax-line">
                                            <For each={tokenize_code_line(line)}>
                                                {(token) => (
                                                    <span
                                                        class={`syntax-token ${token.kind}`}
                                                        classList={{
                                                            "syntax-error":
                                                                inline_error()?.line === line_index() &&
                                                                inline_error()!.column >= token.start &&
                                                                inline_error()!.column < token.end
                                                        }}
                                                    >
                                                        {token.value}
                                                    </span>
                                                )}
                                            </For>
                                        </span>
                                    )}
                                </For>
                            </code>
                        </pre>
                        <textarea
                            id="code_editor"
                            aria-label="Code editor"
                            spellcheck={false}
                            wrap="off"
                            value={current_code()}
                            onInput={(event) => {
                                stop_execution();
                                set_current_code(event.currentTarget.value);
                                set_inline_error(null);
                                set_console_status("Ready");
                            }}
                            onKeyDown={handle_code_key_down}
                            onScroll={(event) => {
                                syntax_layer.scrollTop = event.currentTarget.scrollTop;
                                syntax_layer.scrollLeft = event.currentTarget.scrollLeft;
                                editor_gutter.scrollTop = event.currentTarget.scrollTop;
                            }}
                        />
                    </div>
                </section>

                <button
                    type="button"
                    class="editor-divider"
                    role="separator"
                    aria-label="Resize editor and console"
                    aria-orientation="horizontal"
                    aria-valuemin={40}
                    aria-valuemax={78}
                    aria-valuenow={Math.round(editor_split())}
                    onPointerDown={(event) => {
                        set_is_resizing(true);
                        event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={resize_editor}
                    onPointerUp={(event) => {
                        set_is_resizing(false);
                        event.currentTarget.releasePointerCapture(event.pointerId);
                    }}
                    onPointerCancel={() => set_is_resizing(false)}
                    onKeyDown={(event) => {
                        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                        event.preventDefault();
                        set_editor_split((value) =>
                            Math.min(78, Math.max(40, value + (event.key === "ArrowUp" ? -3 : 3)))
                        );
                    }}
                >
                    <span>
                        <i />
                        <i />
                        <i />
                    </span>
                </button>

                <section class="output-pane" aria-labelledby="output-title">
                    <header class="output-toolbar">
                        <nav aria-label="Editor output">
                            <button
                                id="output-title"
                                type="button"
                                classList={{ "is-active": active_output() === "testcase" }}
                                onClick={() => set_active_output("testcase")}
                            >
                                Testcase
                            </button>
                            <button
                                type="button"
                                classList={{ "is-active": active_output() === "console" }}
                                onClick={() => set_active_output("console")}
                            >
                                Console
                            </button>
                        </nav>
                        <span>{console_status()}</span>
                    </header>

                    <Switch>
                        <Match when={active_output() === "testcase"}>
                            <div class="testcase-view">
                                <div class="testcase-tabs" role="tablist" aria-label="Test cases">
                                    <For each={test_cases()}>
                                        {(_, index) => (
                                            <button
                                                type="button"
                                                role="tab"
                                                aria-selected={active_test_case() === index()}
                                                classList={{
                                                    "is-active": active_test_case() === index(),
                                                    "has-passed": test_results()[index()]?.passed === true,
                                                    "has-failed": test_results()[index()]?.passed === false
                                                }}
                                                onClick={() => set_active_test_case(index())}
                                            >
                                                Case {index() + 1}
                                            </button>
                                        )}
                                    </For>
                                </div>
                                <div class="testcase-details">
                                    <span>Input</span>
                                    <code>{selected_test_case()?.input_args.join(", ") ?? "Unavailable"}</code>
                                    <span>Expected</span>
                                    <code>{selected_test_case()?.expected_output ?? "Unavailable"}</code>
                                    <Show when={selected_test_result()}>
                                        {(result) => (
                                            <>
                                                <span>Actual</span>
                                                <code>{result().actual}</code>
                                                <span>Status</span>
                                                <code class={result().passed ? "test-passed" : "test-failed"}>
                                                    {result().passed
                                                        ? "Passed"
                                                        : result().error ?? "Failed"}
                                                </code>
                                            </>
                                        )}
                                    </Show>
                                </div>
                            </div>
                        </Match>
                        <Match when={active_output() === "console"}>
                            <div
                                class="console-output"
                                ref={console_output}
                                role="log"
                                aria-live="polite"
                            >
                                <For
                                    each={console_entries()}
                                    fallback={
                                        <p class="console-empty">
                                            Run your code to see console output.
                                        </p>
                                    }
                                >
                                    {(entry) => (
                                        <p class={`console-entry console-${entry.level}`}>
                                            <span aria-hidden="true">
                                                {entry.level === "error"
                                                    ? "×"
                                                    : entry.level === "warn"
                                                        ? "!"
                                                        : entry.level === "info"
                                                            ? "i"
                                                            : entry.level === "system"
                                                                ? "•"
                                                                : "›"}
                                            </span>
                                            <code>{entry.text}</code>
                                        </p>
                                    )}
                                </For>
                            </div>
                        </Match>
                    </Switch>
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
                <i>
                    {player.score ?? 0} pts · Challenge {(player.challenge_index ?? 0) + 1}
                </i>
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
