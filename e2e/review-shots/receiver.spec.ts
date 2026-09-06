// 受信者側の画面をレビュー用に撮る。テストではないので CI では走らない
// (playwright.shots.config.ts の testDir にだけ入っている)。
import { expect, test } from "../fixtures/test";
import { prepareReceiver, setDownloadOptions, setLocale, shot, VIEWPORTS } from "../helpers/shots";

test("受信者: ダッシュボード / ギャラリー / 詳細 / 設定", async ({ page }) => {
  test.setTimeout(180_000);
  await prepareReceiver(page, { photos: 4 });

  await page.setViewportSize(VIEWPORTS.desktop);

  await page.goto("/dashboard");
  await expect(page.getByText("あなたの受信URL")).toBeVisible({ timeout: 20_000 });
  await shot(page, "receiver", "dashboard-ja", { fullPage: true });

  await page.goto("/gallery");
  await expect(page.getByRole("button", { name: "選択/DL" })).toBeVisible({ timeout: 20_000 });
  await shot(page, "receiver", "gallery-ja");

  await page.getByRole("button", { name: "選択/DL" }).click();
  await page.getByRole("button", { name: "全選択" }).click();
  await shot(page, "receiver", "gallery-selectbar-ja");
  await page.getByRole("button", { name: "完了" }).click();

  await page.getByRole("img", { name: "@kuukemo" }).first().click();
  await expect(page).toHaveURL(/\/gallery\/[0-9a-f-]+/);
  await expect(page.getByRole("button", { name: "ダウンロード", exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await shot(page, "receiver", "photo-detail-ja", { fullPage: true });

  await page.goto("/settings");
  await expect(page.getByText("受信オプション")).toBeVisible({ timeout: 20_000 });
  await shot(page, "receiver", "settings-ja", { fullPage: true });
});

test("受信者: 選択バーをモバイル幅の ja / en で比べる", async ({ page }) => {
  test.setTimeout(180_000);
  await prepareReceiver(page, { photos: 4 });

  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto("/gallery");
  await expect(page.getByRole("button", { name: "選択/DL" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "選択/DL" }).click();
  await page.getByRole("button", { name: "全選択" }).click();
  await shot(page, "mobile", "gallery-selectbar-ja");

  // 訳文の長い en で崩れないかを見る (選択バーを 2 行構成にしている理由)
  await setLocale(page, "en");
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("button", { name: /Select all/i }).click();
  await shot(page, "mobile", "gallery-selectbar-en");
});

test("受信者: DL オプションダイアログの 3 状態 (R17)", async ({ page }) => {
  test.setTimeout(180_000);
  await prepareReceiver(page, { photos: 2 });

  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto("/gallery");
  await expect(page.getByRole("button", { name: "選択/DL" })).toBeVisible({ timeout: 20_000 });
  // 未設定に戻して初回 DL の確認ダイアログを出す
  await setDownloadOptions(page, null);
  await page.reload();

  await page.getByRole("button", { name: "選択/DL" }).click();
  await page.getByRole("button", { name: "全選択" }).click();
  await page.getByRole("button", { name: "DL", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await shot(page, "dialog", "default-artist-model");
  await dialog.getByText("撮影者 (Artist) 欄に記録").click();
  await shot(page, "dialog", "artist");
  // 「記録しない」では記録形式の注記が消える (ダイアログの高さが変わる)
  await dialog.getByText("記録しない").click();
  await shot(page, "dialog", "none");
});
