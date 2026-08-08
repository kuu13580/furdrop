import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

export default defineConfig({
  sourceLocale: "ja",
  locales: ["ja", "en"],
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}/messages",
      include: ["<rootDir>/src"],
      // 開発者しか見ない画面。カタログに入れても死に文字列になる
      exclude: [
        "**/node_modules/**",
        "<rootDir>/src/pages/DesignPreviewPage.tsx",
        "<rootDir>/src/pages/__shots__/**",
        "<rootDir>/src/lib/debug-log.ts",
      ],
    },
  ],
  format: formatter({ lineNumbers: false }),
});
