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

  // 4. ギャラリー: 1 枚の写真が表示される
  //    AppLayout のロゴ <img alt="FurDrop"> と区別するため alt 属性 (= 送信者名) で取得。
  //    seedOnePhotoFor で senderName: "@e2e_sender" を渡しているので、GalleryPage の
  //    <img alt={photo.sender_name ?? "写真"}> がこの alt を持つ。
  await page.goto("/gallery");
  const photoImg = page.getByRole("img", { name: "@e2e_sender" });
  await expect(photoImg).toBeVisible({ timeout: 15_000 });

  // 5. 写真詳細 → DL リンク (ダウンロードボタンを目視確認、実 DL は別経路)
  //    R17 で「ダウンロードオプション」ボタンが隣に増えたので exact 一致で絞る
  //    (部分一致だと両方拾って strict mode 違反になり、描画順で落ちたり通ったりする)
  await photoImg.click();
  await expect(page).toHaveURL(/\/gallery\/[0-9a-f-]+/);
  await expect(page.getByRole("button", { name: "ダウンロード", exact: true })).toBeVisible({
    timeout: 10_000,
  });
});
