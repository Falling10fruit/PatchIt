import { render } from "solid-js/web";
import { App } from "./index.tsx";
const root = document.getElementById("root")
if (root) render(App, root);

import { initializeApp } from "firebase/app"
import { getDatabase } from "firebase/database"

const app = initializeApp({
    apiKey: "AIzaSyB-_eEMOa9D_Q1bIREy8YqLFw1ve0BLUnE",
    authDomain: "patchit-8af4d.firebaseapp.com",
    databaseURL: "https://patchit-8af4d-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "patchit-8af4d",
    storageBucket: "patchit-8af4d.firebasestorage.app",
    messagingSenderId: "616259528072",
    appId: "1:616259528072:web:d4c2f03617a3557b9d063d"
}); const database = getDatabase(app);


document.getElementById("create_room_button")!.onclick = () => {

}