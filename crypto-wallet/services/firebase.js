import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyDSu1BUytABFl145cj1gcY825kYeXe9w5U",
  authDomain: "rizon-wallet.firebaseapp.com",
  projectId: "rizon-wallet",
  storageBucket: "rizon-wallet.firebasestorage.app",
  messagingSenderId: "1072621486591",
  appId: "1:1072621486591:web:8e5aac7bb791554897e7ca",
  measurementId: "G-2K9ZY85YFM",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  // Already initialized (fast refresh)
  auth = getAuth(app);
}

const db = getFirestore(app);

export { app, auth, db };
