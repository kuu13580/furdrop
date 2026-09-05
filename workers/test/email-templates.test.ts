import { describe, expect, it } from "vitest";
import {
  EMAIL_LOCALES,
  EMAIL_TYPES,
  type EmailType,
  placeholdersOf,
  rawSource,
  renderEmail,
  type TemplateVars,
} from "../src/lib/email-templates";

/**
 * 文言は運用者が `src/emails/*.txt` を直接書き換える。Lingui のカタログ外なので
 * `pnpm i18n:check` は効かない。ここが唯一の網になる。
 */

/** 各テンプレートが受け取る値。README.md の表と一致していること */
const VARS: Record<EmailType, TemplateVars> = {
  digest: { count: 12, senders: "@a、@b", gallery_url: "https://furdrop.app/gallery" },
  expiry: { count: 3, days: 14, gallery_url: "https://furdrop.app/gallery" },
  quota: {
    percent: 82,
    used: "8.2 GB",
    quota: "10 GB",
    gallery_url: "https://furdrop.app/gallery",
  },
  verify: { email: "taro@example.com", verify_url: "https://furdrop.app/verify-email?token=x" },
};

/** verify 以外はフッター (配信停止 / 設定) が付く */
const FOOTER_VARS: TemplateVars = {
  unsubscribe_url: "https://furdrop.app/unsubscribe?t=x&k=digest",
  settings_url: "https://furdrop.app/settings",
};

function varsFor(type: EmailType): TemplateVars {
  return type === "verify" ? VARS[type] : { ...VARS[type], ...FOOTER_VARS };
}

describe("通知メールのテンプレート", () => {
  for (const type of EMAIL_TYPES) {
    for (const locale of EMAIL_LOCALES) {
      it(`${type}.${locale} が描画できる (目的: 変数名のタイプミスと {{ }} の消し忘れを検出する)`, () => {
        const mail = renderEmail(type, locale, varsFor(type));

        expect(mail.subject.length).toBeGreaterThan(0);
        // 展開漏れがあると受信者に {{count}} がそのまま届く
        expect(mail.subject).not.toContain("{{");
        expect(mail.text).not.toContain("{{");
        expect(mail.html).not.toContain("{{");
      });
    }
  }

  for (const type of EMAIL_TYPES) {
    it(`${type} の ja と en でプレースホルダが一致する (目的: 片方だけ編集したのを検出する)`, () => {
      const ja = placeholdersOf(rawSource(type, "ja"));
      const en = placeholdersOf(rawSource(type, "en"));
      expect([...ja].sort()).toEqual([...en].sort());
    });
  }

  it("footer も ja/en でプレースホルダが一致する", () => {
    expect([...placeholdersOf(rawSource("footer", "ja"))].sort()).toEqual(
      [...placeholdersOf(rawSource("footer", "en"))].sort(),
    );
  });

  it("未定義のプレースホルダは例外にする (目的: 黙って空文字で送らない)", () => {
    expect(() => renderEmail("digest", "ja", { count: 1 })).toThrow(/unknown placeholder/);
  });

  it("verify にはフッターを付けない (目的: 購読前に解除リンクを出さない)", () => {
    const mail = renderEmail("verify", "ja", VARS.verify);
    expect(mail.text).not.toContain("unsubscribe");
    expect(mail.html).not.toContain("unsubscribe");
  });

  it("英語の複数形が単数で切り替わる", () => {
    const one = renderEmail("digest", "en", { ...varsFor("digest"), count: 1 });
    const many = renderEmail("digest", "en", { ...varsFor("digest"), count: 2 });
    expect(one.subject).toContain("1 new photo");
    expect(one.subject).not.toContain("photos");
    expect(many.subject).toContain("2 new photos");
  });

  it("本文の記号が HTML に昇格する (目的: レイアウトの印が効いていることの確認)", () => {
    const html = renderEmail("digest", "ja", varsFor("digest")).html;
    // 字下げラベル + URL は CTA ボタンに
    expect(html).toContain("https://furdrop.app/gallery");
    expect(html).toContain("#D96A4A");
    // フッターの `ラベル: URL` はラベルだけがリンクになる
    expect(html).toContain(">このメールの配信を停止する</a>");
  });

  it("テンプレート由来の文字列を HTML エスケープする (目的: 送信者名経由の HTML 混入を防ぐ)", () => {
    const html = renderEmail("digest", "ja", {
      ...varsFor("digest"),
      senders: "<script>alert(1)</script>",
    }).html;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
