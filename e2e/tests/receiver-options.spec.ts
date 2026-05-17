// R14: 設定ページで exif_embed_mode を required に変更 → 送信者 UI に「必須」バッジが出る
import { expect, test } from "@playwright/test";
import { createEmulatorUser, registerReceiver, signInOnPage } from "../helpers/auth";

test("設定で EXIF 埋め込みを必須に変更すると、送信者 UI に '必須' バッジが表示される", async ({
  page,
  context,
}) => {
  const user = await createEmulatorUser();
  const handle = `e2e_opts_${Date.now()}`;
  const { sendKey } = await registerReceiver(user, handle);

  // 受信者として login → 設定 → EXIF を「必須」に
  await page.goto("/login");
  await signInOnPage(page, user);
  await page.goto("/settings");

  const exifRadioGroup = page.getByRole("radiogroup", { name: "EXIF埋め込み" });
  await exifRadioGroup.getByText("必須").click();

  // 別タブで送信者ビューを開く
  const senderPage = await context.newPage();
  await senderPage.goto(`/send/${handle}/upload?k=${sendKey}`);

  // ファイル選択しないと詳細パネルが出ないので、最小 JPEG を投入
  const { tinyJpeg } = await import("../fixtures/images");
  await senderPage.locator("input[type=file]").setInputFiles(tinyJpeg());

  // 「必須」バッジ (= EXIF カメラモデル欄に埋め込む の右側) が出ること
  await expect(senderPage.getByText("EXIFカメラモデル欄に埋め込む")).toBeVisible();
  await expect(
    senderPage.getByText("EXIFカメラモデル欄に埋め込む").locator("xpath=..").getByText("必須"),
  ).toBeVisible();
});
