import { lingui } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    // Lingui のマクロをビルド時に展開する (ランタイムには残らない)
    babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] }),
    lingui(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      // `en/index.html` は英語 OGP カード専用の静的な入口 (広告のリンク先)。
      // 実体は JS で `/?lang=en` へ飛ばすだけで、SPA のルートは増えない
      input: { main: "index.html", en: "en/index.html" },
    },
  },
  server: {
    port: 4000,
    proxy: {
      "/dev/images": "http://localhost:9000",
    },
  },
});
