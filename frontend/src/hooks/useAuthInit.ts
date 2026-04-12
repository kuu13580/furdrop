import { onAuthStateChanged } from "firebase/auth";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { authApi } from "../lib/api";
import { auth } from "../lib/firebase";
import { authAtom } from "../stores/auth";

/** Firebase Auth の状態変化を監視し、Jotai atom に反映する */
export function useAuthInit() {
  const setAuth = useSetAtom(authAtom);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          await authApi.getMe();
          setAuth({ status: "authenticated", user, registered: true });
        } catch {
          // 404=未登録、その他エラーも設定画面に誘導（自然なリカバリ）
          setAuth({ status: "authenticated", user, registered: false });
        }
      } else {
        setAuth({ status: "unauthenticated" });
      }
    });
    return unsubscribe;
  }, [setAuth]);
}
