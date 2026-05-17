import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// テスト時のみ Firebase Auth Emulator に接続する。
// 本番では VITE_FIREBASE_AUTH_EMULATOR_HOST が未定義なので no-op。
// この経路は production build に含まれるが、env が空文字 / undefined なら何も起きない。
const emulatorHost = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST;
if (emulatorHost) {
  connectAuthEmulator(auth, `http://${emulatorHost}`, { disableWarnings: true });
  // E2E の page.evaluate からは bare specifier "firebase/auth" を解決できないため、
  // emulator 接続時のみ window に必要な API を露出する。本番では emulatorHost が
  // undefined のためこのブロック自体が実行されず、グローバルへの副作用も発生しない。
  (window as unknown as { __firebaseForTests?: unknown }).__firebaseForTests = {
    auth,
    signInWithEmailAndPassword,
  };
}
