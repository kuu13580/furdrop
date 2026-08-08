import { Trans, useLingui } from "@lingui/react/macro";
import { signOut } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import logoUrl from "../../assets/logos/logo.png";
import { auth } from "../../lib/firebase";
import ConfirmDialog from "../ui/ConfirmDialog";
import LocaleToggle from "../ui/LocaleToggle";
import AppFooter from "./AppFooter";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-[14px] transition-colors ${
    isActive ? "font-semibold text-brand" : "font-medium text-ink-soft hover:text-ink"
  }`;

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-xl px-4 py-3 text-[16px] transition-colors ${
    isActive
      ? "bg-brand-tint font-semibold text-brand"
      : "font-medium text-ink hover:bg-surface-sand"
  }`;

export default function AppLayout() {
  const { t } = useLingui();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const location = useLocation();

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await signOut(auth);
    } finally {
      setLoggingOut(false);
      setLogoutConfirmOpen(false);
    }
  }, []);

  // ルート遷移でメニューを自動クローズ
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname 変化の検知のみが目的
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // メニュー展開中は背景スクロールをロック + Escape で閉じる
  useEffect(() => {
    if (!menuOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="flex min-h-dvh flex-col bg-surface-canvas text-ink antialiased">
      <header className="sticky top-0 z-30 border-b border-surface-sand-deep bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <Link to="/dashboard" className="flex shrink-0 items-center">
            <img src={logoUrl} alt="FurDrop" className="h-9" />
          </Link>

          {/* デスクトップナビ (sm+) */}
          <nav className="hidden items-center gap-6 sm:flex">
            <NavLink to="/dashboard" className={navLinkClass}>
              <Trans>ダッシュボード</Trans>
            </NavLink>
            <NavLink to="/gallery" className={navLinkClass}>
              <Trans>ギャラリー</Trans>
            </NavLink>
            <NavLink to="/settings" className={navLinkClass}>
              <Trans>設定</Trans>
            </NavLink>
            <button
              type="button"
              onClick={() => setLogoutConfirmOpen(true)}
              className="rounded-lg px-2 py-1 text-[13px] text-ink-muted transition-colors hover:bg-surface-sand hover:text-ink-soft"
            >
              <Trans>ログアウト</Trans>
            </button>
            <LocaleToggle />
          </nav>

          {/* モバイル: トグルはドロワーに入れず常時見える位置に置く */}
          <div className="flex items-center gap-1 sm:hidden">
            <LocaleToggle />

            {/* モバイルハンバーガー (sm未満) */}
            <button
              type="button"
              aria-label={menuOpen ? t`メニューを閉じる` : t`メニューを開く`}
              aria-expanded={menuOpen}
              aria-controls="app-mobile-menu"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-sand"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                role="img"
                aria-hidden="true"
              >
                {menuOpen ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* モバイルメニュー: 背景 + ドロワー (ヘッダー直下からスライドイン) */}
      {menuOpen && (
        <>
          <button
            type="button"
            aria-label={t`メニューを閉じる`}
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 top-14 z-10 bg-ink/40 backdrop-blur-sm sm:hidden"
          />
          <div
            id="app-mobile-menu"
            className="fixed inset-x-0 top-14 z-20 border-b border-surface-sand-deep bg-surface shadow-card sm:hidden"
          >
            <nav className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-3">
              <NavLink to="/dashboard" className={mobileNavLinkClass}>
                <Trans>ダッシュボード</Trans>
              </NavLink>
              <NavLink to="/gallery" className={mobileNavLinkClass}>
                <Trans>ギャラリー</Trans>
              </NavLink>
              <NavLink to="/settings" className={mobileNavLinkClass}>
                <Trans>設定</Trans>
              </NavLink>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setLogoutConfirmOpen(true);
                }}
                className="mt-1 rounded-xl px-4 py-3 text-left text-[14px] font-medium text-ink-soft transition-colors hover:bg-surface-sand"
              >
                <Trans>ログアウト</Trans>
              </button>
            </nav>
          </div>
        </>
      )}

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
      <AppFooter />

      <ConfirmDialog
        open={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={handleLogout}
        title={t`ログアウトしますか？`}
        description={t`再度ログインするには Twitter 認証が必要です。`}
        confirmLabel={t`ログアウト`}
        variant="danger"
        loading={loggingOut}
      />
    </div>
  );
}
