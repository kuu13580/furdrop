import { signOut } from "firebase/auth";
import { Link, NavLink, Outlet } from "react-router";
import { auth } from "../../lib/firebase";

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link to="/dashboard" className="text-lg font-bold">
            FurDrop
          </Link>
          <nav className="flex items-center gap-4">
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                isActive ? "font-medium text-blue-600" : "text-gray-600"
              }
            >
              ダッシュボード
            </NavLink>
            <NavLink
              to="/gallery"
              className={({ isActive }) =>
                isActive ? "font-medium text-blue-600" : "text-gray-600"
              }
            >
              ギャラリー
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                isActive ? "font-medium text-blue-600" : "text-gray-600"
              }
            >
              設定
            </NavLink>
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              ログアウト
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
