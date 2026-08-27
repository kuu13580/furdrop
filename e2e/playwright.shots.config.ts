// レビュー用スクショ (`pnpm shots:review`) の設定。
// 本体のテスト設定を継いで testDir だけ差し替える。CI の `pnpm test:e2e` は
// testDir が ./tests なのでこちらは走らない。
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testDir: "./review-shots",
  outputDir: "./review-shots/.playwright",
  retries: 0,
  reporter: "list",
  use: { ...base.use, video: "off", trace: "off" },
});
