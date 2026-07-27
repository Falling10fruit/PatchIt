import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyB-_eEMOa9D_Q1bIREy8YqLFw1ve0BLUnE",
  authDomain: "patchit-8af4d.firebaseapp.com",
  projectId: "patchit-8af4d",
  storageBucket: "patchit-8af4d.firebasestorage.app",
  messagingSenderId: "616259528072",
  appId: "1:616259528072:web:d4c2f03617a3557b9d063d"
};

const app = initializeApp();
const db = getDatabase(app);

const textarea = document.getElementById("textarea");
textarea.value = "diwjdiwjw";