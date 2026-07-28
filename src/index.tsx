import { createSignal, createEffect, Switch, Match } from "solid-js";
import WelcomeScreen from "./welcome/index.tsx";
import PlayScreen from "./play/index.tsx";

enum Screens {
    WELCOME_SCREEN = "welcome_screen",
    PLAY_SCREEN = "play_screen"
}
const [current_screen, set_current_screen] = createSignal(Screens.WELCOME_SCREEN);

function App ()  {
    return (<>
        <Switch fallback={<WelcomeScreen />}>
            <Match when={current_screen() === Screens.WELCOME_SCREEN}>
                <WelcomeScreen />
            </Match>
            
            <Match when={current_screen() === Screens.PLAY_SCREEN}>
                <PlayScreen />
            </Match>
        </Switch>
    </>)
}

export { App, Screens, set_current_screen };