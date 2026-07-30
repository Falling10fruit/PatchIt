import { onCleanup, onMount } from "solid-js";

const COLUMN_WIDTH = 20;
const FRAME_TIME = 50;
const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*+-<>[]{}";

interface MatrixRainProps {
    direction?: "vertical" | "center-outward";
}

export default function MatrixRain(props: MatrixRainProps) {
    let canvas!: HTMLCanvasElement;

    onMount(() => {
        const context = canvas.getContext("2d");
        if (!context) return;

        const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
        let characterPositions: number[] = [];
        let intervalId: number | undefined;

        const resize = () => {
            const width = window.innerWidth;
            const height = window.innerHeight;
            const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

            canvas.width = Math.floor(width * pixelRatio);
            canvas.height = Math.floor(height * pixelRatio);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

            if (props.direction === "center-outward") {
                const rowCount = Math.floor(height / COLUMN_WIDTH) + 1;
                const outwardSpan = width / 2 + COLUMN_WIDTH;
                characterPositions = Array.from(
                    { length: rowCount },
                    () => Math.random() * outwardSpan
                );
            } else {
                const columnCount = Math.floor(width / COLUMN_WIDTH) + 1;
                characterPositions = Array(columnCount).fill(0);
            }

            context.fillStyle = "#000";
            context.fillRect(0, 0, width, height);
        };

        const draw = () => {
            const width = window.innerWidth;
            const height = window.innerHeight;

            context.fillStyle = "#0001";
            context.fillRect(0, 0, width, height);
            context.fillStyle = "#560bad";
            context.font = '15pt "Intel One Mono", monospace';

            if (props.direction === "center-outward") {
                const center = width / 2;
                const outwardSpan = center + COLUMN_WIDTH;

                characterPositions.forEach((distance, rowIndex) => {
                    const yPosition = rowIndex * COLUMN_WIDTH;
                    const leftCharacter = characters[Math.floor(Math.random() * characters.length)];
                    const rightCharacter = characters[Math.floor(Math.random() * characters.length)];

                    context.fillText(leftCharacter, center - distance, yPosition);
                    context.fillText(rightCharacter, center + distance, yPosition);
                    characterPositions[rowIndex] =
                        (distance + COLUMN_WIDTH) % outwardSpan;
                });
            } else {
                characterPositions.forEach((yPosition, columnIndex) => {
                    const character = characters[Math.floor(Math.random() * characters.length)];
                    const xPosition = columnIndex * COLUMN_WIDTH;

                    context.fillText(character, xPosition, yPosition);
                    characterPositions[columnIndex] =
                        yPosition > 100 + Math.random() * 10000
                            ? 0
                            : yPosition + COLUMN_WIDTH;
                });
            }
        };

        const updateAnimation = () => {
            if (intervalId !== undefined) {
                window.clearInterval(intervalId);
                intervalId = undefined;
            }

            draw();
            if (!motionPreference.matches) {
                intervalId = window.setInterval(draw, FRAME_TIME);
            }
        };

        resize();
        updateAnimation();
        window.addEventListener("resize", resize);
        motionPreference.addEventListener("change", updateAnimation);

        onCleanup(() => {
            if (intervalId !== undefined) window.clearInterval(intervalId);
            window.removeEventListener("resize", resize);
            motionPreference.removeEventListener("change", updateAnimation);
        });
    });

    return <canvas ref={canvas} class="matrix-rain" aria-hidden="true" />;
}
