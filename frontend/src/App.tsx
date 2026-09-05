import { useAtom, useSetAtom } from "jotai";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation, useSearchParams } from "react-router";
import AuthGuard from "./components/AuthGuard";
import AppLayout from "./components/layout/AppLayout";
import SenderLayout from "./components/layout/SenderLayout";
import LoadingSpinner from "./components/ui/LoadingSpinner";
import { useAuthInit } from "./hooks/useAuthInit";
import { trackPageView } from "./lib/analytics";
import { setDebugEnabled } from "./lib/debug-log";
import { LOCALE_QUERY_PARAM } from "./lib/i18n";
import DashboardPage from "./pages/DashboardPage";
import DesignPreviewPage from "./pages/DesignPreviewPage";
import GalleryPage from "./pages/GalleryPage";
import GuidePage from "./pages/GuidePage";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import NotFoundPage from "./pages/NotFoundPage";
import PhotoDetailPage from "./pages/PhotoDetailPage";
import SettingsPage from "./pages/SettingsPage";
import DonePage from "./pages/send/DonePage";
import SendLandingPage from "./pages/send/LandingPage";
import UploadingPage from "./pages/send/UploadingPage";
import UploadPage from "./pages/send/UploadPage";
import { debugAtom } from "./stores/debug";
import { setLocaleAtom } from "./stores/locale";

// 開発時のみ「使い方ガイド」用スクリーンショット撮影ページを bundle に含める
// (本番ビルドでは import.meta.env.DEV が false で完全に除去される)
const ShotsPage = import.meta.env.DEV ? lazy(() => import("./pages/__shots__/ShotsPage")) : null;

// 法務ページは表示頻度が低く、Markdown レンダラ (react-markdown + remark-gfm) を含むため
// メインバンドルから切り離して訪問時のみフェッチする
const LegalPage = lazy(() => import("./pages/LegalPage"));

function LegalFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-canvas">
      <LoadingSpinner size="lg" />
    </div>
  );
}

/**
 * URL の `?debug=true` / `?debug=false` を検知して debugAtom に同期する。
 * クエリ不在では値を変更しないため、一度 ON にすれば遷移後も維持される（sticky）。
 *
 * あわせて atom の値を debug-log のモジュールフラグへミラーする。React 外の
 * 画像処理パイプライン（image-processing.ts / runPipeline）が `debugLog.*` を
 * 呼べるようにするため。atom が真の状態で、ここはその写し。
 */
function DebugUrlSync() {
  const [searchParams] = useSearchParams();
  const [debug, setDebug] = useAtom(debugAtom);
  useEffect(() => {
    const v = searchParams.get("debug");
    if (v === "true") setDebug(true);
    else if (v === "false") setDebug(false);
  }, [searchParams, setDebug]);
  useEffect(() => {
    setDebugEnabled(debug);
  }, [debug]);
  return null;
}

/**
 * `?lang=` を検知してロケールに同期する (DebugUrlSync と同じ sticky な挙動)。
 *
 * 適用したら URL からは外す。`?lang=` は localStorage より優先されるため、
 * 残したままトグルで切り替えるとリロードで巻き戻ってしまう。除去は Router 経由で
 * 行い、history を直接触らない (searchParams と食い違わせないため)。
 */
function LocaleUrlSync() {
  const [searchParams, setSearchParams] = useSearchParams();
  const setLocale = useSetAtom(setLocaleAtom);
  useEffect(() => {
    const v = searchParams.get(LOCALE_QUERY_PARAM);
    if (v !== "ja" && v !== "en") return;
    setLocale(v);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(LOCALE_QUERY_PARAM);
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams, setLocale]);
  return null;
}

/** SPA の画面遷移を GA4 に送る (GA4 側の拡張計測は使わない。理由は lib/analytics.ts)。 */
function PageViewTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);
  return null;
}

export default function App() {
  useAuthInit();

  return (
    <BrowserRouter>
      <DebugUrlSync />
      <LocaleUrlSync />
      <PageViewTracker />
      <Routes>
        {/* 送信者フロー（認証不要） */}
        <Route element={<SenderLayout />}>
          <Route path="/send/:handle" element={<SendLandingPage />} />
          <Route path="/send/:handle/upload" element={<UploadPage />} />
          <Route path="/send/:handle/uploading" element={<UploadingPage />} />
          <Route path="/send/:handle/done" element={<DonePage />} />
        </Route>

        {/* ログイン */}
        <Route path="/login" element={<LoginPage />} />

        {/* 利用規約・プライバシーポリシー（認証不要・遅延ロード） */}
        <Route
          path="/terms"
          element={
            <Suspense fallback={<LegalFallback />}>
              <LegalPage doc="terms" />
            </Suspense>
          }
        />
        <Route
          path="/privacy"
          element={
            <Suspense fallback={<LegalFallback />}>
              <LegalPage doc="privacy" />
            </Suspense>
          }
        />

        {/* 受信者フロー（認証必須） */}
        <Route element={<AuthGuard />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/gallery/:photoId" element={<PhotoDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        {/* デザイン規約 (DESIGN.md) の生きたカナリア */}
        <Route path="/design-preview" element={<DesignPreviewPage />} />

        {/* 使い方ガイド (認証不要) */}
        <Route path="/guide" element={<GuidePage />} />

        {/* 開発時のみ: 使い方ガイド用 UI スクリーンショット撮影ページ */}
        {ShotsPage && (
          <>
            <Route
              path="/__shots"
              element={
                <Suspense fallback={null}>
                  <ShotsPage />
                </Suspense>
              }
            />
            <Route
              path="/__shots/:slug"
              element={
                <Suspense fallback={null}>
                  <ShotsPage />
                </Suspense>
              }
            />
          </>
        )}

        {/* ルート → ランディングページ (LP) */}
        <Route path="/" element={<LandingPage />} />

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
