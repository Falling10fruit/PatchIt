import { child, update } from "firebase/database"
import css from "../gameover/index.css?raw"
import { players_joined } from "../main";
import { For } from "solid-js";

export default function Gameover() {
    update(child(window.room_reference, "players/" + window.this_user_id), { ready: false });

    return (<main>
        <style>{css}</style>

        <h1>leaderboard</h1>
        <ol>
            <For each={players_joined().sort((a, b) => a.)}>
                {(player) => <li>
                    {player[i].name}
                </li>}
            </For>
        </ol>

        <h3>play again?</h3>
        <ul>
            <For each={players_joined()}>
                {(player: [string, Player]) => <li>{player[1].name} is {
                    player[1].ready ? "yes!" : "not ready"
                }</li>}
            </For>
        </ul>
        <button id="try_again_button">try again</button>
    </main>)
}

function restart