'use client';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyBacnFYKRatYjMrkM8qQQz7qvKCbjJ95tM",
  authDomain: "pos-al-chat-bot.firebaseapp.com",
  projectId: "pos-al-chat-bot",
  storageBucket: "pos-al-chat-bot.firebasestorage.app",
  messagingSenderId: "781090398143",
  appId: "1:781090398143:web:d24bb1cb300923ff9ccb0a",
  measurementId: "G-S9T7RQX9RS"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Analytics only in the browser environment
let analytics = null;
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
}

const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth, analytics };