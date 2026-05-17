// HEIC 経路 (iOS 写真): heic-to の WASM デコードが Chromium ヘッドレスで動くかを検証
// `e2e/fixtures/sample.heic` がリポジトリにない場合は skip 扱い (実 HEIC fixture が必要)
import { expect, test } from "@playwright/test";
import { readHeicIfExists } from "../fixtures/images";
import { createEmulatorUser, registerReceiver } from "../helpers/auth";

test("HEIC ファイルを投入しても heic-to 経由で JPEG に変換されて完了画面まで到達する", async ({
  page,
}) => {
  const heic = readHeicIfExists();
  test.skip(!heic, "e2e/fixtures/sample.heic が見つからないため HEIC 経路の検証をスキップ");

  const user = await createEmulatorUser();
  const handle = `e2e_heic_${Date.now()}`;
  const { sendKey } = await registerReceiver(user, handle);

  await page.goto(`/send/${handle}/upload?k=${sendKey}`);
  const fileInput = page.locator("input[type=file]");
  await fileInput.setInputFiles(heic!);
  await expect(page.getByText("1枚選択中")).toBeVisible({ timeout: 10_000 });

  await page.getByLabel(/送信者名を記載しない場合/).check();
  await page.getByRole("button", { name: /送信する/ }).click();

  // HEIC → JPEG 変換に時間がかかるのでタイムアウトを長めに
  await expect(page).toHaveURL(new RegExp(`/send/${handle}/done`), { timeout: 90_000 });
  await expect(page.getByRole("heading", { name: /送信しました/ })).toBeVisible();
});
