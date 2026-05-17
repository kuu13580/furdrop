// R16: 不正な ?k= でセッション開始しようとすると 403 INVALID_KEY → UI でエラー表示
import { expect, test } from "@playwright/test";
import { tinyJpeg } from "../fixtures/images";
import { createEmulatorUser, registerReceiver } from "../helpers/auth";

test("不正な ?k= では送信開始時にエラー画面 (Uploading でエラーアラート) になる", async ({
  page,
}) => {
  const user = await createEmulatorUser();
  const handle = `e2e_invalid_${Date.now()}`;
  await registerReceiver(user, handle);

  await page.goto(`/send/${handle}/upload?k=obviously-bad-key`);
  await page.locator("input[type=file]").setInputFiles(tinyJpeg());
  await page.getByLabel(/送信者名を記載しない場合/).check();
  await page.getByRole("button", { name: /送信する/ }).click();

  // Uploading 画面に遷移はする (UI 上のキー検証はしていない) が、
  // POST /send/:handle/sessions で 403 → 画面にエラー表示
  await expect(page).toHaveURL(new RegExp(`/send/${handle}/uploading`));
  await expect(page.getByText(/アクセスキー|INVALID_KEY|失敗|エラー/i)).toBeVisible({
    timeout: 30_000,
  });
});
