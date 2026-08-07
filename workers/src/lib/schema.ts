import type { Hook } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";

/** 共通エラーレスポンス */
export const ErrorSchema = z.object({
  error: z.object({
    code: z.string().openapi({ example: "NOT_FOUND" }),
    message: z.string().openapi({ example: "Resource not found" }),
  }),
});

/**
 * zod バリデーション失敗を共通エラー形式に揃える defaultHook。
 *
 * これが無いと `@hono/zod-openapi` は ZodError をそのまま 400 で返すため、
 * `{ error: { code, message } }` を前提にしているクライアントの
 * エラー解決 (frontend/src/lib/api-error.ts) が素通りしてしまう。
 * 全ての OpenAPIHono インスタンスに渡すこと。
 *
 * `message` は開発者向けの英語テキスト。ユーザー向け文言はクライアント側で
 * `code` から解決するため、ここを多言語化する必要はない。
 *
 * 既知の割り切り: ここが返す 400 は各ルートの `responses` に宣言していないため
 * `/openapi.json` には現れない。ドキュメントは dev 限定 (本番では 404) なので、
 * 全ルートに 400 を足すコストに見合わないと判断している。
 */
// biome-ignore lint/suspicious/noExplicitAny: Hook のジェネリクスは各ルータの Env に依存するため任意型で受ける
export const defaultHook: Hook<unknown, any, string, unknown> = (result, c) => {
  if (result.success) return;
  const issue = result.error.issues[0];
  const path = issue?.path.join(".");
  const message = issue
    ? `Validation failed${path ? ` at "${path}"` : ""}: ${issue.message}`
    : "Validation failed";
  return c.json({ error: { code: "INVALID_REQUEST", message } }, 400);
};

/** 未指定・値なしのときの既定オフセット (JST)。i18n 対応前の挙動との後方互換 */
const DEFAULT_TZ_OFFSET_MIN = 540;

/**
 * クライアントのタイムゾーンオフセット (UTC からの分数、東が正)。
 * ブラウザは `-new Date().getTimezoneOffset()` で得る。
 *
 * 日付グルーピング (date_counts) と DL ファイル名はこのオフセットで日境界を決める。
 * 既定値 540 (JST) は後方互換のため — 未指定のクライアントは従来どおり JST で動く。
 *
 * 注意: リクエスト時点の固定オフセットなので、夏時間の切り替わりを跨ぐ写真は
 * 境界が 1 時間ずれる。日付見出しの粒度では許容する (IANA タイムゾーンでの
 * 厳密な変換は SQLite の strftime では表現できない)。
 */
export const TzOffsetMinQuery = z
  // 未指定 (undefined) と値なし (`?tz_offset_min=` → 空文字) の両方を既定値に寄せる。
  // `.default()` を外側に付けても空文字には効かず、`z.coerce.number()` は空文字を
  // 0 (UTC) に変換してしまうため、preprocess の中で既定値まで解決させる
  .preprocess(
    (v) => (v === undefined || v === "" ? DEFAULT_TZ_OFFSET_MIN : v),
    z.coerce.number().int().min(-720).max(840),
  )
  .openapi({
    param: { name: "tz_offset_min", in: "query" },
    // preprocess 経由だと zod-openapi が制約と既定値を推論できないので明示する
    // (required: false は推論済み)
    type: "integer",
    minimum: -720,
    maximum: 840,
    default: DEFAULT_TZ_OFFSET_MIN,
    example: DEFAULT_TZ_OFFSET_MIN,
  });

/** handle パスパラメータ */
export const HandleParam = z.object({
  handle: z
    .string()
    .regex(/^[a-z0-9_]{3,32}$/)
    .openapi({ param: { name: "handle", in: "path" } }),
});

/** sessionId パスパラメータ */
export const SessionIdParam = z.object({
  sessionId: z
    .string()
    .uuid({ version: "v4" })
    .openapi({ param: { name: "sessionId", in: "path" } }),
});

/** photoId パスパラメータ */
export const PhotoIdParam = z.object({
  photoId: z
    .string()
    .uuid({ version: "v4" })
    .openapi({ param: { name: "photoId", in: "path" } }),
});
