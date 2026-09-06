import { Hono } from "hono";
import {
  EMAIL_LOCALES,
  EMAIL_TYPES,
  type EmailLocale,
  type EmailType,
  renderEmail,
  type TemplateVars,
} from "../lib/email-templates";
import type { Env } from "../types";

/**
 * 開発用画像プロキシ
 * ローカル R2 バインディングから画像を直接返す。
 * 本番ではマウントされないので到達不可能。
 */
const dev = new Hono<{ Bindings: Env }>();

dev.get("/images/thumbs/:key{.+}", async (c) => {
  const key = c.req.param("key");
  const object = await c.env.R2_THUMBS.get(key);
  if (!object) return c.notFound();
  c.header("Content-Type", "image/jpeg");
  c.header("Cache-Control", "no-cache");
  return c.body(object.body);
});

dev.get("/images/originals/:key{.+}", async (c) => {
  const key = c.req.param("key");
  const object = await c.env.R2_ORIGINALS.get(key);
  if (!object) return c.notFound();
  c.header("Content-Type", "image/jpeg");
  // filename指定せず attachment のみ → フロントの <a download> 属性で命名される
  c.header("Content-Disposition", "attachment");
  return c.body(object.body);
});

dev.get("/images/view/:key{.+}", async (c) => {
  const key = c.req.param("key");
  const object = await c.env.R2_ORIGINALS.get(key);
  if (!object) return c.notFound();
  c.header("Content-Type", "image/jpeg");
  c.header("Cache-Control", "no-cache");
  return c.body(object.body);
});

// --- PUT: ローカルR2への書き込み ---

dev.put("/images/upload/originals/:key{.+}", async (c) => {
  const key = c.req.param("key");
  const body = await c.req.arrayBuffer();
  await c.env.R2_ORIGINALS.put(key, body, {
    httpMetadata: { contentType: "image/jpeg" },
  });
  return c.body(null, 200);
});

dev.put("/images/upload/thumbs/:key{.+}", async (c) => {
  const key = c.req.param("key");
  const body = await c.req.arrayBuffer();
  await c.env.R2_THUMBS.put(key, body, {
    httpMetadata: { contentType: "image/jpeg" },
  });
  return c.body(null, 200);
});

// --- 通知メールのプレビュー (R09) ---
//
// 文言を編集した結果をブラウザで確認するための窓。本番ではマウントされない。
// Cloudflare の Activity log は本文を約7日保持するため本番では preview を切って運用する
// (ダイジェストに送信者名が載る)。その代わりの確認手段でもある。

/** プレビュー用のダミー値。実運用の見え方に寄せる */
const PREVIEW_VARS: Record<EmailType, TemplateVars> = {
  digest: { count: 12, senders: "@hanako_photo、@taro、ほか1名", gallery_url: "" },
  expiry: { count: 34, days: 14, gallery_url: "" },
  quota: { percent: 82, used: "8.2 GB", quota: "10 GB", gallery_url: "" },
  verify: { email: "taro@example.com", verify_url: "" },
};

const PREVIEW_EN_VARS: Partial<Record<EmailType, TemplateVars>> = {
  digest: { count: 12, senders: "@hanako_photo, @taro and 1 other", gallery_url: "" },
};

dev.get("/emails", (c) => {
  const rows = EMAIL_TYPES.flatMap((type) =>
    EMAIL_LOCALES.map(
      (locale) =>
        `<li><a href="/dev/emails/${type}/${locale}">${type}.${locale}</a> ` +
        `(<a href="/dev/emails/${type}/${locale}?text=1">text</a>)</li>`,
    ),
  ).join("");
  return c.html(`<h1>Email previews</h1><ul>${rows}</ul>`);
});

dev.get("/emails/:type/:locale", (c) => {
  const type = c.req.param("type") as EmailType;
  const locale = c.req.param("locale") as EmailLocale;
  if (!EMAIL_TYPES.includes(type) || !EMAIL_LOCALES.includes(locale)) return c.notFound();

  const origin = c.env.APP_ORIGIN || new URL(c.req.url).origin;
  const base = { ...PREVIEW_VARS[type], ...(locale === "en" ? PREVIEW_EN_VARS[type] : {}) };
  const vars: TemplateVars = {
    ...base,
    gallery_url: `${origin}/gallery`,
    verify_url: `${origin}/verify-email?token=preview`,
    ...(type === "verify"
      ? {}
      : {
          unsubscribe_url: `${origin}/unsubscribe?t=preview&k=${type}`,
          settings_url: `${origin}/settings`,
        }),
  };

  const mail = renderEmail(type, locale, vars);
  if (c.req.query("text")) {
    c.header("Content-Type", "text/plain; charset=utf-8");
    return c.body(`Subject: ${mail.subject}\n\n${mail.text}`);
  }
  return c.html(mail.html);
});

export default dev;
