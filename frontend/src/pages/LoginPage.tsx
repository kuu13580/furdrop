import { signInWithPopup, TwitterAuthProvider } from "firebase/auth";
import { useAtomValue } from "jotai";
import { useCallback, useState } from "react";
import { Navigate } from "react-router";
import { auth } from "../lib/firebase";
import { authAtom } from "../stores/auth";

export default function LoginPage() {
  const authState = useAtomValue(authAtom);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTwitterLogin = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, new TwitterAuthProvider());
    } catch (e) {
      setError(e instanceof Error ? e.message : "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  // 認証済み: 登録済み→ダッシュボード、未登録→設定（スラッグ設定）
  if (authState.status === "authenticated") {
    return <Navigate to={authState.registered ? "/dashboard" : "/settings"} replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 px-4 text-center">
        <h1 className="text-3xl font-bold">FurDrop</h1>
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
