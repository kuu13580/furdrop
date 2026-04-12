import { BrowserRouter, Route, Routes } from "react-router";
import AuthGuard from "./components/AuthGuard";
import AppLayout from "./components/layout/AppLayout";
import { useAuthInit } from "./hooks/useAuthInit";
import DashboardPage from "./pages/DashboardPage";
import GalleryPage from "./pages/GalleryPage";
import LoginPage from "./pages/LoginPage";
import NotFoundPage from "./pages/NotFoundPage";
import PhotoDetailPage from "./pages/PhotoDetailPage";
import SettingsPage from "./pages/SettingsPage";
import DonePage from "./pages/send/DonePage";
import LandingPage from "./pages/send/LandingPage";
import UploadingPage from "./pages/send/UploadingPage";
import UploadPage from "./pages/send/UploadPage";

export default function App() {
  useAuthInit();

  return (
    <BrowserRouter>
      <Routes>
        {/* 送信者フロー（認証不要） */}
        <Route path="/send/:handle" element={<LandingPage />} />
        <Route path="/send/:handle/upload" element={<UploadPage />} />
        <Route path="/send/:handle/uploading" element={<UploadingPage />} />
        <Route path="/send/:handle/done" element={<DonePage />} />

        {/* ログイン */}
        <Route path="/login" element={<LoginPage />} />

        {/* 受信者フロー（認証必須） */}
        <Route element={<AuthGuard />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/gallery/:photoId" element={<PhotoDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        {/* ルート → ログインへ */}
        <Route path="/" element={<LoginPage />} />

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
