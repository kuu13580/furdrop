// 送信者側の画面をレビュー用に撮る。
import { expect, test } from "@playwright/test";
import { patchOptions } from "../helpers/auth";
import { prepareReceiver, SAMPLE_JPEG, shot, VIEWPORTS } from "../helpers/shots";

test("送信者: ランディング / アップロード / 受付停止", async ({ page }) => {
  test.setTimeout(180_000);
  const { user, handle, sendKey } = await prepareReceiver(page, { photos: 1 });

  await page.setViewportSize(VIEWPORTS.desktop);

  await page.goto(`/send/${handle}?k=${sendKey}`);
  await expect(page.getByRole("link", { name: /写真を送る/ })).toBeVisible({ timeout: 20_000 });
  await shot(page, "sender", "landing-ja", { fullPage: true });

  await page.goto(`/send/${handle}/upload?k=${sendKey}`);
  // 実画像を 1 枚選ぶと送信者情報フォームが出る (未選択だと出ない)
  await page.setInputFiles('input[type="file"]', SAMPLE_JPEG);
  await expect(page.getByText("送信者名 / TwitterID")).toBeVisible({ timeout: 30_000 });
  await shot(page, "sender", "upload-ja", { fullPage: true });

  // 受付停止 (R11) の見え方
  await patchOptions(user, { is_active: false });
  await page.goto(`/send/${handle}?k=${sendKey}`);
  await expect(page.getByRole("link", { name: /写真を送る/ })).toHaveCount(0, { timeout: 20_000 });
  await shot(page, "sender", "landing-paused-ja", { fullPage: true });
});
