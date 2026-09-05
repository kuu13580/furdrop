// R08: 一括ダウンロード。Workers のストリーミング ZIP を隠しフォームの POST で受け取る。
// 「フォーム POST が実際にダウンロードを発火させ、開ける ZIP が保存されること」を見る。
// (EXIF バイト列の正しさは workers の統合テストで担保している)
import { readFile } from "node:fs/promises";
import { expect, test } from "../fixtures/test";
import { createEmulatorUser, registerReceiver, signInOnPage } from "../helpers/auth";
import { seedOnePhotoFor } from "../helpers/seed-photo";

test("選択した写真をまとめて ZIP でダウンロードできる", async ({ page }) => {
  const user = await createEmulatorUser();
  const handle = `e2e_bulkdl_${Date.now()}`;
  const { sendKey } = await registerReceiver(user, handle);
  await seedOnePhotoFor(handle, sendKey, { senderName: "@e2e_bulk" });
  await seedOnePhotoFor(handle, sendKey, { senderName: "@e2e_bulk" });

  await page.goto("/login");
  await signInOnPage(page, user);
  await page.goto("/gallery");

  await expect(page.getByRole("img", { name: "@e2e_bulk" }).first()).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "選択/DL" }).click();
  await page.getByRole("button", { name: "全選択" }).click();
  await expect(page.getByText("2枚選択中")).toBeVisible();

  // 未設定なので DL を押すとまず EXIF オプションのダイアログが出る (R17)
  await page.getByRole("button", { name: "DL", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByText("撮影者 (Artist) 欄に記録").click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "ダウンロード" }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^furdrop-e2e_bulkdl_\d+-\d{14}\.zip$/);

  // ZIP のセントラルディレクトリと 2 エントリぶんのローカルヘッダがあること。
  // 途中で切れた ZIP は EOCD を持たないので、ここが最低限の健全性チェックになる
  const saved = await readFile(await download.path());
  expect(saved.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  expect(saved.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBe(true);
  let localHeaders = 0;
  for (let i = 0; i + 4 <= saved.length; i++) {
    if (
      saved[i] === 0x50 &&
      saved[i + 1] === 0x4b &&
      saved[i + 2] === 0x03 &&
      saved[i + 3] === 0x04
    )
      localHeaders++;
  }
  expect(localHeaders).toBe(2);

  // フォーム POST は attachment を返すのでページは残ったまま (target="_self" の前提)
  await expect(page).toHaveURL(/\/gallery$/);
  await expect(page.getByText("2枚選択中")).toBeVisible();
});
