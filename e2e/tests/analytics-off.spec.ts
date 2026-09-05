// 開発ビルドで GA4 (gtag.js) が読み込まれないことの回帰テスト。
// fixtures/test.ts が計測ホストを塞いでいるので「リクエストが飛ばないこと」では検出できず、
// 直書きタグが gtag.js のロード前に定義するシムの有無を見る。

import { expect, test } from "../fixtures/test";

test("開発ビルドでは gtag.js を読み込まない (window.gtag が生えない)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#root")).not.toBeEmpty();

  expect(await page.evaluate(() => typeof (window as { gtag?: unknown }).gtag)).toBe("undefined");
  expect(await page.locator('script[src*="googletagmanager.com"]').count()).toBe(0);
});
