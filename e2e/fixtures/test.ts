/**
 * 全 spec 共通の test フィクスチャ。`@playwright/test` の代わりにこれを import する。
 *
 * 計測系ホストを context ごと遮断する。アプリ側も本番ビルド + 本番ホストでしか gtag.js を
 * 読まないが (`frontend/src/lib/analytics.ts`)、index.html への直書きで再発しうるため二重に塞ぐ。
 */
import { test as base } from "@playwright/test";

export { expect, type Locator, type Page } from "@playwright/test";

const ANALYTICS_HOSTS = /googletagmanager\.com|google-analytics\.com|analytics\.google\.com/;

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route(ANALYTICS_HOSTS, (route) => route.abort());
    await use(context);
  },
});
