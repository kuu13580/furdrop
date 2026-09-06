// R15: アカウント削除の確認フロー (設定 → ハンドル再入力 → 削除 → /login へリダイレクト)
import { expect, test } from "../fixtures/test";
import { createEmulatorUser, registerReceiver, signInOnPage } from "../helpers/auth";

test("設定ページから自身のハンドルを再入力して削除すると /login に戻る (R15 の誤操作防止 + 削除動線)", async ({
  page,
}) => {
  const user = await createEmulatorUser();
  const handle = `e2e_del_${Date.now()}`;
  await registerReceiver(user, handle, "Delete Me");

  await page.goto("/login");
  await signInOnPage(page, user);
  await page.goto("/settings");

  // 「アカウントを削除」ボタンクリックでダイアログが開く
  await page.getByRole("button", { name: "アカウントを削除" }).click();
  await expect(page.getByRole("heading", { name: "アカウントを削除しますか？" })).toBeVisible();

  // 確認用ハンドル未入力では削除ボタンが disabled
  const submitBtn = page.getByRole("button", { name: "削除する" });
  await expect(submitBtn).toBeDisabled();

  // 一致するハンドルを入力して削除実行
  await page.getByLabel("確認用ハンドル").fill(handle);
  await expect(submitBtn).toBeEnabled();
  await submitBtn.click();

  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
});
