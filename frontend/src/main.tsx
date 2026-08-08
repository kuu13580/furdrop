import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import I18nProvider from "./components/I18nProvider";
import { initAnalytics } from "./lib/analytics";
import "./index.css";

// クライアント側エラー(未捕捉例外 / 未処理 reject / チャンクロード失敗)を GA へ計測する
initAnalytics();

const root = document.getElementById("root") as HTMLElement;
createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
