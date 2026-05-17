// 送信者フロー S01→S02→S03→S04 (R02/R16/X02/X03)
// 未認証ユーザーが ?k=KEY 付き URL から JPEG を 1 枚送って完了画面に到達するまで。
import { expect, test } from "@playwright/test";
import { tinyJpeg } from "../fixtures/images";
import { createEmulatorUser, registerReceiver } from "../helpers/auth";

test("ランディング → アップロード → 送信完了までの送信者フロー全体が成立する", async ({ page }) => {
  // 受信者を 1 人セットアップ (REST API 経由で本物の register エンドポイントを叩く)
  const user = await createEmulatorUser();
  const handle = `e2e_send_${Date.now()}`;
  const { sendKey } = await registerReceiver(user, handle, "E2E Sender Test");

  // S01: ランディング
  await page.goto(`/send/${handle}?k=${sendKey}`);
  await expect(page.getByRole("heading", { name: "E2E Sender Test" })).toBeVisible();
  await page.getByRole("link", { name: "写真を送る" }).click();

  // S02: アップロード画面 — ファイル投入
  await expect(page).toHaveURL(new RegExp(`/send/${handle}/upload`));
  const fileInput = page.locator("input[type=file]");
  await fileInput.setInputFiles(tinyJpeg());
  await expect(page.getByText("1枚選択中")).toBeVisible();

  // 送信者名なしで進む場合は「同意」チェックが必要 (受信者は optional/disabled 設定)
  await page.getByLabel(/送信者名を記載しない場合/).check();
  await page.getByRole("button", { name: /送信する/ }).click();

  // S03→S04: 完了画面まで遷移して「枚送信しました」表示
  await expect(page).toHaveURL(new RegExp(`/send/${handle}/done`), { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /送信しました/ })).toBeVisible();
});
