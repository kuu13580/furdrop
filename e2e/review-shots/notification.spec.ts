// 通知設定 (R09) の画面をレビュー用に撮る。テストではないので CI では走らない。
import { expect, test } from "@playwright/test";
import { prepareReceiver, setLocale, shot, VIEWPORTS } from "../helpers/shots";

test("受信者: 通知設定カードの 3 状態", async ({ page }) => {
  test.setTimeout(180_000);
  await prepareReceiver(page, { photos: 2 });
  await page.setViewportSize(VIEWPORTS.desktop);

  await page.goto("/settings");
  await expect(page.getByText("通知先メールアドレス")).toBeVisible({ timeout: 20_000 });
  await shot(page, "notification", "settings-empty-ja", { fullPage: true });

  // アドレスを保存すると検証待ちになる (確認メールは dev では送られずログに出るだけ)
  await page.getByLabel("通知先メールアドレス").fill("taro@example.com");
  await page.getByRole("button", { name: "保存して確認メールを送る" }).click();
  await expect(page.getByText("確認メールを送りました")).toBeVisible({ timeout: 20_000 });
  await shot(page, "notification", "settings-pending-ja", { fullPage: true });

  await setLocale(page, "en");
  await expect(page.getByText("Notification email address")).toBeVisible({ timeout: 20_000 });
  await shot(page, "notification", "settings-pending-en", { fullPage: true });
});

test("認証不要ページ: 確認 / 配信停止", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(VIEWPORTS.desktop);

  // 無効なトークンの見え方 (正常系はトークンが使い捨てなのでスクショに向かない)
  await page.goto("/verify-email?token=invalid-token");
  await expect(page.getByText("このリンクは使用できません")).toBeVisible({ timeout: 20_000 });
  await shot(page, "notification", "verify-invalid-ja");

  // 解除は**開いた時点では実行されない**。確認ボタンを押させる
  await page.goto("/unsubscribe?t=sometoken&k=digest");
  await expect(page.getByRole("button", { name: "配信を停止する" })).toBeVisible({
    timeout: 20_000,
  });
  await shot(page, "notification", "unsubscribe-confirm-ja");

  await page.getByRole("button", { name: "配信を停止する" }).click();
  await expect(page.getByText("配信を停止しました")).toBeVisible({ timeout: 20_000 });
  await shot(page, "notification", "unsubscribe-done-ja");
});
