import { onAuthStateChanged } from "firebase/auth";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { ApiError, authApi } from "../lib/api";
import { auth } from "../lib/firebase";
import { authAtom } from "../stores/auth";
import { userAtom } from "../stores/user";

/** Firebase Auth の状態変化を監視し、Jotai atom に反映する */
export function useAuthInit() {
  const setAuth = useSetAtom(authAtom);
  const setUser = useSetAtom(userAtom);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const { user: profile } = await authApi.getMe();
          setUser(profile);
          setAuth({ status: "authenticated", user, registered: true });
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            // 未登録ユーザー → 設定画面で登録を促す
            setUser(null);
            setAuth({ status: "authenticated", user, registered: false });
          } else {
            // ネットワーク障害やサーバーエラー → ログアウト状態に戻す
            setUser(null);
            setAuth({ status: "unauthenticated" });
          }
        }
      } else {
        setUser(null);
        setAuth({ status: "unauthenticated" });
      }
    });
    return unsubscribe;
  }, [setAuth, setUser]);
}
