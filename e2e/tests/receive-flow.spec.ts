// 受信者フロー S05→S06→S07→S08 (R03/R05)
// Auth Emulator でログイン後、ダッシュボード → ギャラリー → 詳細 → DL の動線が成立すること。
import { expect, test } from "@playwright/test";
import { createEmulatorUser, registerReceiver, signInOnPage } from "../helpers/auth";
import { seedOnePhotoFor } from "../helpers/seed-photo";

test("ログイン → ダッシュボード → ギャラリー → 写真詳細 → DL リンクが押せる動線", async ({
  page,
}) => {
  // 1. 受信者作成 + 1 枚 seed
  const user = await createEmulatorUser();
  const handle = `e2e_recv_${Date.now()}`;
  const { sendKey } = await registerReceiver(user, handle, "Receiver Test");
  await seedOnePhotoFor(handle, sendKey, { senderName: "@e2e_sender" });

  // 2. login ページにアクセスして Auth state を準備
  //    LoginPage は Twitter OAuth しか UI 経路を持たないので、page.evaluate で直接 signIn
  await page.goto("/login");
  await signInOnPage(page, user);

  // 3. AuthGuard が onAuthStateChanged を拾って自動で /dashboard へ遷移する
  //    (Twitter ハンドラと同じ動線)
  await page.goto("/dashboard");
  await expect(page.getByText(handle)).toBeVisible({ timeout: 15_000 });

  // 4. ギャラリー: 1 枚の写真が表示される (img タグの存在 = ギャラリー表示成功)
  await page.goto("/gallery");
  const photoImg = page.locator("img").first();
  await expect(photoImg).toBeVisible({ timeout: 15_000 });

  // 5. 写真詳細 → DL リンク (ダウンロードボタンを目視確認、実 DL は別経路)
  await photoImg.click();
  await expect(page).toHaveURL(/\/gallery\/[0-9a-f-]+/);
  await expect(page.getByText(/ダウンロード|DL/i)).toBeVisible({ timeout: 10_000 });
});
