// R16 opt-out: 受信者がキーを外すと ?k= 無しの URL でも送信が成立する

import { tinyJpeg } from "../fixtures/images";
import { expect, test } from "../fixtures/test";
import { createEmulatorUser, patchOptions, registerReceiver } from "../helpers/auth";

test("opt-out した受信者には ?k= 無しの URL で送信できる", async ({ page }) => {
  const user = await createEmulatorUser();
  const handle = `e2e_optout_${Date.now()}`;
  await registerReceiver(user, handle, "E2E Opt-out Test");

  const { receiveUrl } = await patchOptions(user, { require_send_key: false });
  expect(receiveUrl).toBe(`/send/${handle}`);

  await page.goto(receiveUrl);
  await page.getByRole("link", { name: "写真を送る" }).click();

  await expect(page).toHaveURL(new RegExp(`/send/${handle}/upload`));
  await page.locator("input[type=file]").setInputFiles(tinyJpeg());
  await page.getByLabel(/送信者名を記載しない場合/).check();
  await page.getByRole("button", { name: /送信する/ }).click();

  await expect(page).toHaveURL(new RegExp(`/send/${handle}/done`), { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /送信しました/ })).toBeVisible();
});
