// R17: 受信者が DL するときに送信者名を EXIF に記録する
// 初回 DL でダイアログが出て選択が永続化されること、選んだ内容がファイルに書き込まれることを見る。
import { readFile } from "node:fs/promises";
import { expect, test } from "../fixtures/test";
import { createEmulatorUser, registerReceiver, signInOnPage } from "../helpers/auth";
import { seedOnePhotoFor } from "../helpers/seed-photo";

test("初回 DL でオプションを選ぶと EXIF に撮影者名が入り、2 回目以降はダイアログが出ない", async ({
  page,
}) => {
  const user = await createEmulatorUser();
  const handle = `e2e_exifdl_${Date.now()}`;
  const { sendKey } = await registerReceiver(user, handle);
  await seedOnePhotoFor(handle, sendKey, { senderName: "@e2e_sender" });

  await page.goto("/login");
  await signInOnPage(page, user);

  await page.goto("/gallery");
  const photoImg = page.getByRole("img", { name: "@e2e_sender" });
  await expect(photoImg).toBeVisible({ timeout: 15_000 });
  await photoImg.click();
  await expect(page).toHaveURL(/\/gallery\/[0-9a-f-]+/);

  // 未設定なので、DL を押すと先にオプションダイアログが出る
  const downloadButton = page.getByRole("button", { name: "ダウンロード", exact: true });
  await downloadButton.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByText("カメラ機種 (Model) 欄にも記録").click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "ダウンロード" }).click(),
  ]);

  // 記録した文字列がファイルに含まれること (piexif が書いた APP1 セグメント内)
  const path = await download.path();
  const saved = await readFile(path);
  expect(saved.includes("Photo by e2e_sender")).toBe(true);

  // 2 回目はダイアログを挟まずそのまま DL される (設定は localStorage に残る)
  // ▾ は aria-hidden なのでアクセシブル名には入らない
  await expect(page.getByRole("button", { name: "ダウンロードオプション" })).toBeVisible();
  const [second] = await Promise.all([page.waitForEvent("download"), downloadButton.click()]);
  expect((await readFile(await second.path())).includes("Photo by e2e_sender")).toBe(true);
  await expect(page.getByRole("dialog")).toBeHidden();
});
