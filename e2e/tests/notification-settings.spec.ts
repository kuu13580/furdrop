// R09: 通知先メールアドレスの登録 → 検証待ち → 取り消し、と配信停止ページ
import { expect, test } from "../fixtures/test";
import { createEmulatorUser, registerReceiver, signInOnPage } from "../helpers/auth";

test("通知先アドレスを保存すると検証待ちになり、取り消せる (R09 double opt-in)", async ({
  page,
}) => {
  const user = await createEmulatorUser();
  await registerReceiver(user, `e2e_notif_${Date.now()}`);

  await page.goto("/login");
  await signInOnPage(page, user);
  await page.goto("/settings");

  // 宛先が無いうちは種類のチェックボックスを触れない
  const digest = page.getByRole("checkbox", { name: /新着写真のお知らせ/ });
  await expect(digest).toBeDisabled();

  await page.getByLabel("通知先メールアドレス").fill("taro@example.com");
  await page.getByRole("button", { name: "保存して確認メールを送る" }).click();

  // 検証が済むまでは「検証待ち」。ここで通知が届き始めてはいけない
  await expect(page.getByText("確認メールを送りました")).toBeVisible();
  await expect(page.getByText("taro@example.com").last()).toBeVisible();
  // 検証待ちの間は先に種類を選べる
  await expect(digest).toBeEnabled();

  await page.getByRole("button", { name: "確認を取り消す" }).click();
  await expect(page.getByText("確認メールを送りました")).toBeHidden();
});

test("配信停止ページは開いただけでは解除せず、ボタンを押して解除する (メールスキャナ対策)", async ({
  page,
}) => {
  await page.goto("/unsubscribe?t=e2e-unknown-token&k=digest");

  // 開いた時点では確認を求めるだけ
  await expect(page.getByText("次の通知の配信を停止します。")).toBeVisible();
  await expect(page.getByText("新着写真のお知らせ")).toBeVisible();
  await expect(page.getByText("配信を停止しました")).toBeHidden();

  await page.getByRole("button", { name: "配信を停止する" }).click();
  // 不明なトークンでも 200 を返す (応答から有効性を推測させない) ので完了表示になる
  await expect(page.getByText("配信を停止しました")).toBeVisible();
});

test("確認リンクが無効なら理由を表示する (認証なしで開ける)", async ({ page }) => {
  await page.goto("/verify-email?token=e2e-invalid-token");
  await expect(page.getByText("このリンクは使用できません")).toBeVisible();
});
