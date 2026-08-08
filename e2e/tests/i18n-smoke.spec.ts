import { expect, type Page, test } from "@playwright/test";

/**
 * en ロケールで日本語が残っていないかを実画面で検証する。
 *
 * 静的解析 (scripts/i18n-lint.mjs) では、モジュールスコープ定数のように
 * マクロで包まれていてもロケール切替に追随しないケースを拾えない。
 *
 * TRANSLATED は翻訳が済んだページだけを列挙する。Phase 2 で 1 ページ翻訳する
 * ごとにここへ追加していく。
 */
const TRANSLATED: { name: string; path: string }[] = [{ name: "404", path: "/__not_found__" }];

const JAPANESE = /[぀-ヿ一-鿿]/;

/** ロケール指定は localStorage に注入する。`?lang=` は withKey 等で落ちる経路があるため */
async function gotoWithLocale(page: Page, path: string, locale: "ja" | "en") {
  await page.addInitScript((l) => {
    window.localStorage.setItem("furdrop.locale", l);
  }, locale);
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

for (const { name, path } of TRANSLATED) {
  test(`${name}: en では日本語が表示されない (目的: ロケール切替の実画面検証)`, async ({
    page,
  }) => {
    await gotoWithLocale(page, path, "en");
    const found = (await visibleText(page)).filter((t) => JAPANESE.test(t));
    // 言語トグルの "日本語" は endonym なので意図的に翻訳しない
    expect(found.filter((t) => t.replace(/日本語(に切り替える)?/g, "").match(JAPANESE))).toEqual(
      [],
    );
  });

  test(`${name}: ja では日本語が表示される (目的: 切替が効いていることの裏取り)`, async ({
    page,
  }) => {
    await gotoWithLocale(page, path, "ja");
    const found = (await visibleText(page)).filter((t) => JAPANESE.test(t));
    expect(found.length).toBeGreaterThan(0);
  });
}
