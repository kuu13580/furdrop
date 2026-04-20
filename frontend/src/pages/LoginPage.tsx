import { getAdditionalUserInfo, signInWithPopup, TwitterAuthProvider } from "firebase/auth";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import logoUrl from "../assets/logos/logo.png";
import { auth } from "../lib/firebase";
import { authAtom } from "../stores/auth";
import { sanitizeHandle, suggestedHandleAtom } from "../stores/signup";

export default function LoginPage() {
  const authState = useAtomValue(authAtom);
  const navigate = useNavigate();
  const setSuggestedHandle = useSetAtom(suggestedHandleAtom);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTwitterLogin = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, new TwitterAuthProvider());
      // Twitter screenName を登録フォームのヒントとして保存 (サニタイズ込み)
      const username = getAdditionalUserInfo(result)?.username;
      if (username) {
        const h = sanitizeHandle(username);
        if (h.length >= 3) setSuggestedHandle(h);
      }
      // 認証成功 → ダッシュボードへ (未登録の場合は AuthGuard が /settings に誘導)
      navigate("/dashboard", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [navigate, setSuggestedHandle]);

  // すでに認証済み状態で /login に来た場合 (リロード・直接アクセス)
  if (authState.status === "authenticated") {
    return <Navigate to={authState.registered ? "/dashboard" : "/settings"} replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 px-4 text-center">
        <img src={logoUrl} alt="FurDrop" className="mx-auto h-20" />
        <p className="text-gray-600">
          写真を受け取るための
          <br />
          あなた専用URLを作ろう
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="button"
          onClick={handleTwitterLogin}
          disabled={loading || authState.status === "loading"}
          className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {loading ? "ログイン中..." : "Twitterでログイン"}
        </button>
      </div>
    </div>
  );
}
