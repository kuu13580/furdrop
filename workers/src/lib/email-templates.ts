/**
 * 通知メールの文言 (`src/emails/*.txt`) を読み込んで描画する。
 *
 * 文言をコードから追い出しているのは、運用者が TypeScript を触らずに書き換えられる
 * ようにするため。Wrangler が `.txt` を文字列モジュールとして取り込むので、
 * ビルド設定の追加も要らない。書式は `src/emails/README.md`。
 */

import digestEn from "../emails/digest.en.txt";

import digestJa from "../emails/digest.ja.txt";
import expiryEn from "../emails/expiry.en.txt";
import expiryJa from "../emails/expiry.ja.txt";
import footerEn from "../emails/footer.en.txt";
import footerJa from "../emails/footer.ja.txt";
import quotaEn from "../emails/quota.en.txt";
import quotaJa from "../emails/quota.ja.txt";
import verifyEn from "../emails/verify.en.txt";
import verifyJa from "../emails/verify.ja.txt";
import { wrapHtml } from "./email-layout";

export const EMAIL_TYPES = ["digest", "expiry", "quota", "verify"] as const;
export type EmailType = (typeof EMAIL_TYPES)[number];

export const EMAIL_LOCALES = ["ja", "en"] as const;
export type EmailLocale = (typeof EMAIL_LOCALES)[number];

/** NULL / 未知の値は原文ロケールに寄せる */
export function resolveLocale(value: string | null | undefined): EmailLocale {
  return value === "en" ? "en" : "ja";
}

const SOURCES: Record<string, string> = {
  "digest.ja": digestJa,
  "digest.en": digestEn,
  "expiry.ja": expiryJa,
  "expiry.en": expiryEn,
  "quota.ja": quotaJa,
  "quota.en": quotaEn,
  "verify.ja": verifyJa,
  "verify.en": verifyEn,
  "footer.ja": footerJa,
  "footer.en": footerEn,
};

export type TemplateVars = Record<string, string | number>;

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** `Subject:` 行と本文を切り分ける。footer には Subject が無い */
export function parseSource(source: string): { subject: string | null; body: string } {
  const nl = source.indexOf("\n");
  const first = nl === -1 ? source : source.slice(0, nl);
  const m = /^Subject:\s*(.*)$/.exec(first.trim());
  if (!m) return { subject: null, body: source };
  return { subject: m[1], body: nl === -1 ? "" : source.slice(nl + 1) };
}

const PLACEHOLDER_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

/**
 * `{{name}}` と `{{plural name|単数形|複数形}}` を展開する。
 *
 * 未定義の名前は例外にする。文言を編集して変数名をタイプミスしたとき、
 * `{{coutn}}` のまま送られるより落ちたほうがいい (テストが先に捕まえる)。
 */
export function interpolate(source: string, vars: TemplateVars, where: string): string {
  return source.replace(PLACEHOLDER_RE, (_all, expr: string) => {
    const plural = /^plural\s+([^\s|]+)\s*\|(.*)\|(.*)$/.exec(expr);
    if (plural) {
      const [, name, one, other] = plural;
      const n = Number(lookup(vars, name, where));
      return n === 1 ? one : other;
    }
    return String(lookup(vars, expr, where));
  });
}

function lookup(vars: TemplateVars, name: string, where: string): string | number {
  if (!(name in vars)) {
    throw new Error(`email template ${where}: unknown placeholder "${name}"`);
  }
  return vars[name];
}

/** テンプレート内で使われているプレースホルダ名の集合 (ja/en の対応検証に使う) */
export function placeholdersOf(source: string): Set<string> {
  const names = new Set<string>();
  for (const [, expr] of source.matchAll(PLACEHOLDER_RE)) {
    const plural = /^plural\s+([^\s|]+)\s*\|/.exec(expr);
    names.add(plural ? plural[1] : expr);
  }
  return names;
}

export function rawSource(type: EmailType | "footer", locale: EmailLocale): string {
  const source = SOURCES[`${type}.${locale}`];
  if (source === undefined) throw new Error(`email template not found: ${type}.${locale}`);
  return source;
}

/**
 * 1 通ぶんを描画する。
 *
 * `vars.unsubscribe_url` がある通知にはフッター (配信停止 / 設定へのリンク) を付ける。
 * 確認メール (verify) は購読前なので解除するものが無く、渡さない。
 */
export function renderEmail(
  type: EmailType,
  locale: EmailLocale,
  vars: TemplateVars,
): RenderedEmail {
  const where = `${type}.${locale}`;
  const { subject, body } = parseSource(rawSource(type, locale));
  if (subject === null) throw new Error(`email template ${where}: missing "Subject:" line`);

  const renderedSubject = interpolate(subject, vars, where);
  const renderedBody = interpolate(body, vars, where).trim();

  const footer =
    "unsubscribe_url" in vars
      ? interpolate(rawSource("footer", locale), vars, `footer.${locale}`).trim()
      : null;

  const text = footer ? `${renderedBody}\n\n--\n${footer}\n` : `${renderedBody}\n`;

  return {
    subject: renderedSubject,
    text,
    html: wrapHtml(renderedBody, footer),
  };
}
