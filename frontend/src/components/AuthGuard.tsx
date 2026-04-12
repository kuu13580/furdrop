import { useAtomValue } from "jotai";
import { Navigate, Outlet, useLocation } from "react-router";
import { authAtom } from "../stores/auth";

/** 認証必須ルートのガード。未認証ならログイン、未登録なら設定へリダイレクト。 */
export default function AuthGuard() {
  const authState = useAtomValue(authAtom);
  const location = useLocation();

  if (authState.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">読み込み中...</p>
      </div>
    );
  }

  if (authState.status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  // 未登録ユーザーは /settings 以外にアクセスできない
  if (!authState.registered && location.pathname !== "/settings") {
    return <Navigate to="/settings" replace />;
  }

  return <Outlet />;
}
