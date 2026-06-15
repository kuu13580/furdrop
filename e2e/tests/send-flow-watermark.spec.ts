// 送信者フローの透かし設定 (S05 WatermarkDialog) — R14 watermark_mode / S02 アップロード画面。
// 受信者が watermark_mode を optional/required にした場合に、送信者 UI で透かしを有効化し、
// プレビューダイアログ (候補セレクタ・ズーム) を操作して送信完了できることを確認する。
import { expect, test } from "@playwright/test";
import { tinyJpeg } from "../fixtures/images";
import { createEmulatorUser, registerReceiver } from "../helpers/auth";

/** ファイル投入 → 送信者名入力 → 透かし有効化 → 「透かしを編集」でダイアログを開くまでの共通手順 */
async function openWatermarkDialog(
  page: import("@playwright/test").Page,
  handle: string,
  sendKey: string,
  files: { name: string; mimeType: string; buffer: Buffer }[],
  { senderName = "@e2e_wm", required = false } = {},
) {
  await page.goto(`/send/${handle}/upload?k=${sendKey}`);
  await page.locator("input[type=file]").setInputFiles(files);
  await expect(page.getByText(`${files.length}枚選択中`)).toBeVisible();

  await page.getByLabel("送信者名 / TwitterID").fill(senderName);

  // optional は手動でチェック、required は senderName 入力で自動 ON になる
  if (!required) {
    await page.locator('label:has-text("透かしを入れる")').getByRole("checkbox").check();
  }

  await page.getByRole("button", { name: "透かしを編集" }).click();
  await expect(page.getByRole("heading", { name: "透かしの設定" })).toBeVisible();
}

test("透かし optional: 編集ダイアログを開いて有効化し送信完了できる (目的: 透かしフロー全体の成立)", async ({
  page,
}) => {
  const user = await createEmulatorUser();
  const handle = `e2e_wm_opt_${Date.now()}`;
  const { sendKey } = await registerReceiver(user, handle, "WM Optional", {
    watermark_mode: "optional",
  });

  await openWatermarkDialog(page, handle, sendKey, [tinyJpeg()]);

  // プレビューが読み込めるとズームボタン (透かし箇所をズーム) が出る
  await expect(page.getByRole("button", { name: "透かし箇所をズーム" })).toBeVisible();

  // ダイアログを閉じて送信 → 完了画面
  await page.getByRole("button", { name: "完了" }).click();
  await page.getByRole("button", { name: /送信する/ }).click();
  await expect(page).toHaveURL(new RegExp(`/send/${handle}/done`), { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /送信しました/ })).toBeVisible();
});

test("複数画像でプレビュー候補セレクタが表示され、別画像に切り替えられる (目的: R14 画像選択 UI)", async ({
  page,
}) => {
  const user = await createEmulatorUser();
  const handle = `e2e_wm_multi_${Date.now()}`;
  const { sendKey } = await registerReceiver(user, handle, "WM Multi", {
    watermark_mode: "optional",
  });

  await openWatermarkDialog(page, handle, sendKey, [tinyJpeg("a.jpg"), tinyJpeg("b.jpg")]);

  // 候補は 2 枚。初期は先頭が選択 (aria-pressed=true)
  const first = page.getByRole("button", { name: "a.jpg をプレビュー" });
  const second = page.getByRole("button", { name: "b.jpg をプレビュー" });
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await expect(first).toHaveAttribute("aria-pressed", "true");

  // 2 枚目に切り替えると選択が移る (プレビューが差し替わる)
  await second.click();
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await expect(first).toHaveAttribute("aria-pressed", "false");
});

test("ズームボタンにヒントが出て、トグルでズーム状態が切り替わる (目的: ズーム UX)", async ({
  page,
}) => {
  const user = await createEmulatorUser();
  const handle = `e2e_wm_zoom_${Date.now()}`;
  const { sendKey } = await registerReceiver(user, handle, "WM Zoom", {
    watermark_mode: "optional",
  });

  await openWatermarkDialog(page, handle, sendKey, [tinyJpeg()]);

  // 開いて最初の数秒だけ「ズームできます」ヒントが出て、その後消える
  await expect(page.getByText("ズームできます")).toBeVisible();
  await expect(page.getByText("ズームできます")).toBeHidden({ timeout: 5_000 });

  // ズームボタンを押すと ON (aria-pressed=true) になり、もう一度で OFF に戻る
  const zoomBtn = page.getByRole("button", { name: "透かし箇所をズーム" });
  await expect(zoomBtn).toHaveAttribute("aria-pressed", "false");
  await zoomBtn.click();
  const zoomOffBtn = page.getByRole("button", { name: "ズーム解除" });
  await expect(zoomOffBtn).toHaveAttribute("aria-pressed", "true");
  await zoomOffBtn.click();
  await expect(page.getByRole("button", { name: "透かし箇所をズーム" })).toBeVisible();
});

test("透かし required: チェックが強制 ON になり外せず、編集ダイアログを開ける (目的: required 強制)", async ({
  page,
}) => {
  const user = await createEmulatorUser();
  const handle = `e2e_wm_req_${Date.now()}`;
  const { sendKey } = await registerReceiver(user, handle, "WM Required", {
    watermark_mode: "required",
  });

  await page.goto(`/send/${handle}/upload?k=${sendKey}`);
  await page.locator("input[type=file]").setInputFiles([tinyJpeg()]);
  await page.getByLabel("送信者名 / TwitterID").fill("@e2e_req");

  // required は送信者名入力で自動的にチェック ON かつ disabled (外せない)
  const wmCheckbox = page.locator('label:has-text("透かしを入れる")').getByRole("checkbox");
  await expect(wmCheckbox).toBeChecked();
  await expect(wmCheckbox).toBeDisabled();

  // 「透かしを編集」からダイアログを開ける
  await page.getByRole("button", { name: "透かしを編集" }).click();
  await expect(page.getByRole("heading", { name: "透かしの設定" })).toBeVisible();
});
