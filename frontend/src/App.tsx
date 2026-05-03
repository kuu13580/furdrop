import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import AuthGuard from "./components/AuthGuard";
import AppLayout from "./components/layout/AppLayout";
import SenderLayout from "./components/layout/SenderLayout";
import LoadingSpinner from "./components/ui/LoadingSpinner";
import { useAuthInit } from "./hooks/useAuthInit";
import DashboardPage from "./pages/DashboardPage";
import DesignPreviewPage from "./pages/DesignPreviewPage";
import GalleryPage from "./pages/GalleryPage";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import NotFoundPage from "./pages/NotFoundPage";
import PhotoDetailPage from "./pages/PhotoDetailPage";
import SettingsPage from "./pages/SettingsPage";
import DonePage from "./pages/send/DonePage";
import SendLandingPage from "./pages/send/LandingPage";
import UploadingPage from "./pages/send/UploadingPage";
import UploadPage from "./pages/send/UploadPage";

// 法務ページは表示頻度が低く、Markdown レンダラ (react-markdown + remark-gfm) を含むため
// メインバンドルから切り離して訪問時のみフェッチする
const LegalPage = lazy(() => import("./pages/LegalPage"));

function LegalFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-canvas">
      <LoadingSpinner size="lg" />
    </div>
  );
}

export default function App() {
  useAuthInit();

  return (
    <BrowserRouter>
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

        {/* ⚠️ 確認用プレビュー (削除予定): DesignPreviewPage + このルートを消せば削除完了 */}
        <Route path="/design-preview" element={<DesignPreviewPage />} />

        {/* ルート → ランディングページ (LP) */}
        <Route path="/" element={<LandingPage />} />

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
