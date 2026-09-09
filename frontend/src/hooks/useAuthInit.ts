import { onAuthStateChanged } from "firebase/auth";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { ApiError, authApi } from "../lib/api";
import { auth } from "../lib/firebase";
import { authAtom } from "../stores/auth";
import { localeAtom } from "../stores/locale";
import { userAtom } from "../stores/user";

/** Firebase Auth の状態変化を監視し、Jotai atom に反映する */
export function useAuthInit() {
  const setAuth = useSetAtom(authAtom);
  const setUser = useSetAtom(userAtom);
  const locale = useAtomValue(localeAtom);
  // effect の依存に locale を入れると、言語を切り替えるたびに onAuthStateChanged の
  // 購読を張り直して getMe が走ってしまう。参照だけ最新に保って中から読む。
  // **render 中に ref を書かない** — concurrent render では破棄された render の値が
  // 残りうるので、commit 後の effect で同期する
  const localeRef = useRef(locale);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // getMe 中は loading 状態にして AuthGuard の「読み込み中」を出し、
        // 古い unauthenticated 状態のまま /login に誤リダイレクトされるのを防ぐ
        setAuth({ status: "loading" });
        try {
          const { user: profile } = await authApi.getMe();
          setUser(profile);
          setAuth({ status: "authenticated", user, registered: true });

          // 未ログイン中に言語を切り替えていた場合、サーバー側の locale は古いまま。
          // 通知メール (R09) はこの値で言語を決めるので、ここで追いつかせる。
          // 投げっぱなし — 失敗しても画面は成立するし、次にトグルを押せば直る
          const current = localeRef.current;
          if (profile.locale !== current) {
            authApi.updateOptions({ locale: current }).catch(() => {});
          }
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
