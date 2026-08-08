import { expect, type Page, test } from "@playwright/test";
import { createEmulatorUser, registerReceiver } from "../helpers/auth";

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
  needsReceiver?: boolean;
};

const TRANSLATED: Target[] = [
  { name: "404", path: "/__not_found__" },
  { name: "トップページ", path: "/" },
  { name: "使い方ガイド", path: "/guide" },
  {
    name: "送信者ランディング",
    path: ({ handle, sendKey }) => `/send/${handle}?k=${sendKey}`,
    needsReceiver: true,
  },
  {
    name: "アップロード画面",
    path: ({ handle, sendKey }) => `/send/${handle}/upload?k=${sendKey}`,
    needsReceiver: true,
  },
];

const JAPANESE = /[぀-ヿ一-鿿]/;

async function resolvePath(target: Target): Promise<string> {
  if (typeof target.path === "string") return target.path;
  const user = await createEmulatorUser();
  const handle = `e2e_i18n_${Date.now()}`;
  const { sendKey } = await registerReceiver(user, handle, "E2E i18n");
  return target.path({ handle, sendKey });
}

/** ロケール指定は localStorage に注入する。`?lang=` は withKey 等で落ちる経路があるため */
async function gotoWithLocale(page: Page, path: string, locale: "ja" | "en") {
  await page.addInitScript((l) => {
    window.localStorage.setItem("furdrop.locale", l);
  }, locale);
  // トップの装飾写真は picsum.photos の外部画像。networkidle を外部依存にしないため落とす
  await page.route("https://picsum.photos/**", (route) => route.abort());
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
    await gotoWithLocale(page, await resolvePath(target), "en");
    expect(withoutUntranslatable(await visibleText(page))).toEqual([]);
  });

  test(`${target.name}: ja では日本語が表示される (目的: 切替が効いていることの裏取り)`, async ({
    page,
  }) => {
    await gotoWithLocale(page, await resolvePath(target), "ja");
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
