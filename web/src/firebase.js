import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBT6dLqecx0dZn1l89ptoXYPRDnExUPgNA",
  authDomain: "vortexa-d430e.firebaseapp.com",
  projectId: "vortexa-d430e",
  storageBucket: "vortexa-d430e.firebasestorage.app",
  messagingSenderId: "305241314262",
  appId: "1:305241314262:web:7431988485bbb96fd64a77",
  measurementId: "G-D18WZ9S5S0"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);
