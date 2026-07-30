import { createSignal, Switch, Match } from "solid-js";
import WelcomeScreen from "./welcome/index.tsx";
import PlayScreen from "./play/index.tsx";
import LobbyScreen from "./lobby/index.tsx";
import MatrixRain from "./components/MatrixRain.tsx";

enum Screens {
    WELCOME_SCREEN = "welcome_screen",
    LOBBY_SCREEN = "lobby_screen",
    PLAY_SCREEN = "play_screen",
}
const [current_screen, set_current_screen] = createSignal(Screens.WELCOME_SCREEN);

function App ()  {
    return (
        <div class="app-shell">
            <div
                class="shared-matrix-layer"
                classList={{ "is-hidden": current_screen() === Screens.PLAY_SCREEN }}
                aria-hidden="true"
            >
                <MatrixRain />
            </div>

            <Switch fallback={<WelcomeScreen />}>
                <Match when={current_screen() === Screens.WELCOME_SCREEN}>
                    <WelcomeScreen />
                </Match>

                <Match when={current_screen() === Screens.LOBBY_SCREEN}>
                    <LobbyScreen />
                </Match>

                <Match when={current_screen() === Screens.PLAY_SCREEN}>
                    <PlayScreen />
                </Match>
            </Switch>
        </div>
    );
}

export { App, Screens, current_screen, set_current_screen };
