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

  if (!required) {
    // optional は手動でチェック → チェックと同時に編集ダイアログが自動で開く
    await page.locator('label:has-text("透かしを入れる")').getByRole("checkbox").check();
  } else {
    // required は自動 ON (手動チェックではない) なのでダイアログは開かない → 編集ボタンから開く
    await page.getByRole("button", { name: "透かしを編集" }).click();
  }
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

  // プレビューが読み込めると操作ヒント (ドラッグ/ズーム) が出る
  await expect(page.getByText("ドラッグで配置、ピンチ / ホイールでズーム")).toBeVisible();

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

test("テキストを編集すると送信者名連動が解除され、自由入力が透かしに使われる (目的: 自由テキスト入力)", async ({
  page,
}) => {
  const user = await createEmulatorUser();
  const handle = `e2e_wm_text_${Date.now()}`;
  const { sendKey } = await registerReceiver(user, handle, "WM Text", {
    watermark_mode: "optional",
  });

  await openWatermarkDialog(page, handle, sendKey, [tinyJpeg()]);

  // 初期要素は送信者名クレジットに連動 (autoText)
  const textarea = page.getByLabel("テキスト");
  await expect(textarea).toHaveValue("@e2e_wm");
  await expect(page.getByText("送信者名に連動中（編集すると解除）")).toBeVisible();

  // 編集すると連動が解除され、入力値がそのまま使われる
  await textarea.fill("桜まつり2026");
  await expect(page.getByText("送信者名に連動中（編集すると解除）")).toBeHidden();
  await expect(textarea).toHaveValue("桜まつり2026");
  // 要素チップにも反映される
  await expect(page.getByRole("button", { name: "桜まつり2026" })).toBeVisible();
});

test("文字の追加と削除ができる (目的: 複数要素の管理 UI)", async ({ page }) => {
  const user = await createEmulatorUser();
  const handle = `e2e_wm_multi_el_${Date.now()}`;
  const { sendKey } = await registerReceiver(user, handle, "WM Elements", {
    watermark_mode: "optional",
  });

  await openWatermarkDialog(page, handle, sendKey, [tinyJpeg()]);

  // 「＋ 文字を追加」で 2 つ目の要素が増え、選択が移る (テキストは空)
  await page.getByRole("button", { name: "文字を追加" }).click();
  const textarea = page.getByLabel("テキスト");
  await expect(textarea).toHaveValue("");
  await textarea.fill("#event");
  await expect(page.getByRole("button", { name: "#event" })).toBeVisible();

  // 削除すると要素が消え、選択は残った要素へフォールバック
  await page.getByRole("button", { name: "この要素を削除" }).click();
  await expect(page.getByRole("button", { name: "#event" })).toBeHidden();
  await expect(textarea).toHaveValue("@e2e_wm");
});

test("四角形要素を追加してサイズ・角丸を調整でき、削除もできる (目的: 四角形要素の管理 UI)", async ({
  page,
}) => {
  const user = await createEmulatorUser();
  const handle = `e2e_wm_rect_${Date.now()}`;
  const { sendKey } = await registerReceiver(user, handle, "WM Rect", {
    watermark_mode: "optional",
  });

  await openWatermarkDialog(page, handle, sendKey, [tinyJpeg()]);

  // 「＋ 四角形を追加」で四角形要素が増え、選択が移る
  await page.getByRole("button", { name: "四角形を追加" }).click();
  await expect(page.getByRole("button", { name: "四角形", exact: true })).toBeVisible();

  // 四角形の編集パネル: 幅・高さ・角丸スライダーが出て、テキスト欄・フォントは出ない
  await expect(page.getByLabel(/幅/)).toBeVisible();
  await expect(page.getByLabel(/高さ/)).toBeVisible();
  await expect(page.getByLabel(/角丸/)).toBeVisible();
  await expect(page.getByLabel("テキスト")).toBeHidden();

  // スライダーで幅を変更できる
  await page.getByLabel(/幅/).fill("0.8");
  await expect(page.getByLabel(/幅 \(長辺の80%\)/)).toBeVisible();

  // 削除するとテキスト要素へ選択が戻る
  await page.getByRole("button", { name: "この要素を削除" }).click();
  await expect(page.getByLabel("テキスト")).toHaveValue("@e2e_wm");
});

test("送信者名なしでも透かしを有効化・編集できる (目的: 自由テキストは送信者名に依存しない)", async ({
  page,
}) => {
  const user = await createEmulatorUser();
  const handle = `e2e_wm_noname_${Date.now()}`;
  const { sendKey } = await registerReceiver(user, handle, "WM NoName", {
    watermark_mode: "optional",
  });

  await page.goto(`/send/${handle}/upload?k=${sendKey}`);
  await page.locator("input[type=file]").setInputFiles([tinyJpeg()]);
  await expect(page.getByText("1枚選択中")).toBeVisible();

  // 送信者名を入れずにチェックできる (チェックと同時に編集ダイアログが開く)
  const wmCheckbox = page.locator('label:has-text("透かしを入れる")').getByRole("checkbox");
  await expect(wmCheckbox).toBeEnabled();
  await wmCheckbox.check();
  await expect(page.getByRole("heading", { name: "透かしの設定" })).toBeVisible();

  // autoText 要素は送信者名未入力の警告を出す
  await expect(page.getByText(/送信者名が未入力です/)).toBeVisible();
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
