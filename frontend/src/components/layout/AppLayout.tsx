import { signOut } from "firebase/auth";
import { Link, NavLink, Outlet } from "react-router";
import logoUrl from "../../assets/logos/logo.png";
import { auth } from "../../lib/firebase";
import AppFooter from "./AppFooter";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-[14px] transition-colors ${
    isActive ? "font-semibold text-brand" : "font-medium text-ink-soft hover:text-ink"
  }`;

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-surface-canvas pb-12 text-ink antialiased">
      <header className="sticky top-0 z-20 border-b border-surface-sand-deep bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:h-16 sm:px-6">
          <Link to="/dashboard" className="flex items-center">
            <img src={logoUrl} alt="FurDrop" className="h-9" />
          </Link>
          <nav className="flex items-center gap-4 sm:gap-6">
            <NavLink to="/dashboard" className={navLinkClass}>
              ダッシュボード
            </NavLink>
            <NavLink to="/gallery" className={navLinkClass}>
              ギャラリー
            </NavLink>
            <NavLink to="/settings" className={navLinkClass}>
              設定
            </NavLink>
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="rounded-lg px-2 py-1 text-[13px] text-ink-muted transition-colors hover:bg-surface-sand hover:text-ink-soft"
            >
              ログアウト
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
      <AppFooter />
    </div>
  );
}
