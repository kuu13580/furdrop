// R14: 設定ページで受信オプションを変更 → 送信者 UI に反映される
import { expect, test } from "@playwright/test";
import { tinyJpeg } from "../fixtures/images";
import { createEmulatorUser, registerReceiver, signInOnPage } from "../helpers/auth";

test("設定で透かしを必須に変更すると、送信者 UI に '必須' バッジが表示される", async ({
  page,
  context,
}) => {
  const user = await createEmulatorUser();
  const handle = `e2e_opts_${Date.now()}`;
  const { sendKey } = await registerReceiver(user, handle);

  // 受信者として login → 設定 → 透かしを「必須」に
  await page.goto("/login");
  await signInOnPage(page, user);
  await page.goto("/settings");

  const watermarkRadioGroup = page.getByRole("radiogroup", { name: "透かし" });
  await watermarkRadioGroup.getByText("必須").click();

  // 別タブで送信者ビューを開く
  const senderPage = await context.newPage();
  await senderPage.goto(`/send/${handle}/upload?k=${sendKey}`);

  // ファイル選択しないと詳細パネルが出ないので、最小 JPEG を投入
  await senderPage.locator("input[type=file]").setInputFiles(tinyJpeg());

  // 「必須」バッジ (= 透かしを入れる の右側) が出ること。
  // xpath=.. の親辿りは DOM 階層変更で剥がれやすいので、ラベル要素に絞ってバッジを取得。
  const watermarkLabel = senderPage.locator('label:has-text("透かしを入れる")');
  await expect(watermarkLabel).toBeVisible();
  await expect(watermarkLabel.getByText("必須")).toBeVisible();
});

test("設定で送信者名を必須にすると、送信者 UI で名前必須になり未入力では送信できない (R14 送信者名必須)", async ({
  page,
  context,
}) => {
  const user = await createEmulatorUser();
  const handle = `e2e_reqname_${Date.now()}`;
  const { sendKey } = await registerReceiver(user, handle);

  // 受信者として login → 設定 → 「送信者名の入力を必須にする」を ON
  await page.goto("/login");
  await signInOnPage(page, user);
  await page.goto("/settings");
  // チェック状態は PATCH 成功後に反映される制御コンポーネントなので、
  // click → 反映待ち (check() は即時のstate変化を要求するため使えない)
  const requireNameCheckbox = page.getByRole("checkbox", { name: /送信者名の入力を必須にする/ });
  await requireNameCheckbox.click();
  await expect(requireNameCheckbox).toBeChecked();

  // 別タブで送信者ビューを開く
  const senderPage = await context.newPage();
  await senderPage.goto(`/send/${handle}/upload?k=${sendKey}`);
  await senderPage.locator("input[type=file]").setInputFiles(tinyJpeg());
  await expect(senderPage.getByText("1枚選択中")).toBeVisible();

  // 送信者名ラベルに「必須」バッジが出て、名前なし同意チェックボックスは出ない
  const nameLabel = senderPage.locator('label:has-text("送信者名 / TwitterID")');
  await expect(nameLabel.getByText("必須")).toBeVisible();
  await expect(senderPage.getByText(/クレジット表記なしでの編集・共有/)).toBeHidden();

  // 名前未入力では送信ボタンが無効、入力すると有効になる
  const submit = senderPage.getByRole("button", { name: /送信する/ });
  await expect(submit).toBeDisabled();
  await senderPage.getByLabel("送信者名 / TwitterID").fill("@e2e_named");
  await expect(submit).toBeEnabled();
});
