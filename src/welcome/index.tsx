import css from "../welcome/index.css"

export default function WelcomeScreen () {
    return ( <main>
        <style>{css}</style>

        <h1>Hello there</h1>
        <button id="create_room_button">create room</button>
        <input type="text" id="enter_code_input" placeholder="enter room code here" />
    </main> );
}