interface TestCase {
    input_args: string[];
    expected_output: string;
}

interface Challenge {
    id: string;
    function_name: string;
    title: string;
    intended_behavior: string;
    broken_code: string;
    solution_code: string;
    difficulty_score: number;
    test_cases: TestCase[];
}

type ConsoleLevel = "log" | "info" | "warn" | "error" | "system";

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

import OpenAI from "openai";
    
const open_ai_client = new OpenAI({
    apiKey: ,
    baseURL: "https://api.groq.com/openai/v1"
});

const AI_MODEL = "openai/gpt-oss-120b";
const CHALLENGE_VALIDATION_TIMEOUT_MS = 2500;
const use_local_challenges = false;

export default {
    async fetch(request: Request, env) {
        const url = new URL(request);

        if (url.pathname.startsWith("/api/")) {
            return new Response(JSON.stringify(request_generated_problem));
        }
    }
}

async function request_generated_problem(
    pool_index: number,
    target_difficulty: number
) {
    const response = await open_ai_client.chat.completions.create({
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