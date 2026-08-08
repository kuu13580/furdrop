import { expect, type Page, test } from "@playwright/test";
import { createEmulatorUser, registerReceiver, signInOnPage } from "../helpers/auth";
import { seedOnePhotoFor } from "../helpers/seed-photo";

/**
 * en ロケールで日本語が残っていないかを実画面で検証する。
 *
 * 静的解析 (scripts/i18n-lint.mjs) では、モジュールスコープ定数のように
 * マクロで包まれていてもロケール切替に追随しないケースを拾えない。
 *
 * TRANSLATED は翻訳が済んだページだけを列挙する。Phase 2 で 1 ページ翻訳する
 * ごとにここへ追加していく。直接 goto できる画面に限る (送信中 / 送信完了は
 * 直接開くと前の画面へリダイレクトされるため、送信フロー spec 側でカバーする)。
 *
 * /terms と /privacy は対象外。本文の markdown は日本語を正文とする方針で、
 * en でも日本語のまま表示するのが正しいため (代わりに注意書きを出している)。
 */
type Target = {
  name: string;
  /** 受信者のセットアップが要る画面は handle から path を組み立てる */
  path: string | ((ctx: { handle: string; sendKey: string }) => string);
  /** 認証必須ページ。受信者を作ってログインし、写真を 1 枚 seed してから開く */
  auth?: boolean;
};

const TRANSLATED: Target[] = [
  { name: "404", path: "/__not_found__" },
  { name: "トップページ", path: "/" },
  { name: "使い方ガイド", path: "/guide" },
  {
    name: "送信者ランディング",
    path: ({ handle, sendKey }) => `/send/${handle}?k=${sendKey}`,
  },
  {
    name: "アップロード画面",
    path: ({ handle, sendKey }) => `/send/${handle}/upload?k=${sendKey}`,
  },
  { name: "ログイン", path: "/login" },
  { name: "ダッシュボード", path: "/dashboard", auth: true },
  { name: "ギャラリー", path: "/gallery", auth: true },
  { name: "設定", path: "/settings", auth: true },
];

const JAPANESE = /[぀-ヿ一-鿿]/;

/** 1 回の実行で受信者を何人も作るので、Date.now() だけに頼らず連番も足す */
let handleSeq = 0;

/**
 * 対象ページを開く。認証必須ページはログインと写真 1 枚の seed まで済ませる
 * (空状態だけ見ても、写真がある状態でしか出ない文言を取りこぼすため)。
 */
async function openTarget(page: Page, target: Target, locale: "ja" | "en") {
  await page.addInitScript((l) => {
    window.localStorage.setItem("furdrop.locale", l);
  }, locale);
  // トップの装飾写真は picsum.photos の外部画像。networkidle を外部依存にしないため落とす
  await page.route("https://picsum.photos/**", (route) => route.abort());

  if (typeof target.path === "string" && !target.auth) {
    await page.goto(target.path, { waitUntil: "networkidle" });
    return;
  }

  const user = await createEmulatorUser();
  const handle = `e2e_i18n_${Date.now()}_${handleSeq++}`;
  const { sendKey } = await registerReceiver(user, handle, "E2E i18n");

  if (target.auth) {
    await seedOnePhotoFor(handle, sendKey, { senderName: "e2e_sender" });
    await page.goto("/login");
    await signInOnPage(page, user);
  }

  const path = typeof target.path === "string" ? target.path : target.path({ handle, sendKey });
  await page.goto(path, { waitUntil: "networkidle" });
}

/** 画面に出る文字列 (本文 + 読み上げ対象の属性 + title) を集める */
async function visibleText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [document.title, document.body.innerText];
    for (const el of document.querySelectorAll("[alt],[aria-label],[title],[placeholder]")) {
      for (const attr of ["alt", "aria-label", "title", "placeholder"]) {
        const v = el.getAttribute(attr);
        if (v) out.push(v);
      }
    }
    return out;
  });
}

/**
 * 意図的に翻訳しない文字列を落とす。
 * - 言語トグルの "日本語" は endonym
 * - 受信者の表示名・ハンドルはユーザーデータ (E2E では ASCII なので実害なし)
 */
function withoutUntranslatable(texts: string[]): string[] {
  return texts.filter((t) => JAPANESE.test(t.replace(/日本語/g, "")));
}

for (const target of TRANSLATED) {
  test(`${target.name}: en では日本語が表示されない (目的: ロケール切替の実画面検証)`, async ({
    page,
  }) => {
    await openTarget(page, target, "en");
    expect(withoutUntranslatable(await visibleText(page))).toEqual([]);
  });

  test(`${target.name}: ja では日本語が表示される (目的: 切替が効いていることの裏取り)`, async ({
    page,
  }) => {
    await openTarget(page, target, "ja");
    const found = (await visibleText(page)).filter((t) => JAPANESE.test(t));
    expect(found.length).toBeGreaterThan(0);
  });
}

test("?lang= は保存済みロケールより優先される (目的: 判定の優先順位)", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("furdrop.locale", "ja");
  });
  await page.goto("/__not_found__?lang=en", { waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(withoutUntranslatable(await visibleText(page))).toEqual([]);
});
