/**
 * GA4 (gtag.js) のロードと、`page_view` / `client_error` の送信をまとめる。
 *
 * ## 送信の原則
 * - **gtag.js のロードは本番ビルドかつ本番ホストのときだけ** ({@link shouldLoadGaTag})。
 *   index.html に直書きすると `vite dev` を使う E2E / `pnpm shots` / ローカル開発の
 *   アクセスが本番 GA プロパティに計上される (Playwright は test ごとに `_ga` が変わる)。
 * - `page_location` にはクエリを載せない。送信URLのアクセスキー (R16) が GA に残るため。
 *   SPA の画面遷移も {@link trackPageView} で自前に送る (拡張計測は使わない)。
 * - エラーイベントは **`client_error` の 1 種のみ**。分類は `error_kind` パラメータで行う。
 * - `window.gtag` が未定義(開発 / 広告ブロッカー)なら no-op で {@link debugLog} のみ。
 * - 同一エラーの連投を防ぐため、キー単位で 1 タブあたり {@link DEDUP_LIMIT} 回まで送信。
 * - 個人情報・署名付き URL を送らないよう、message/path をサニタイズする。
 */

import type { ReactEventHandler } from "react";
import { debugLog } from "./debug-log";

const alog = debugLog.scope("analytics");

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

// ---- 送信データスキーマ ----

/** 発生源の分類。GA4 の error_kind パラメータに入る値集合。 */
export type ErrorKind =
  | "image_render" // <img> の R2 GET 失敗 (onError)
  | "image_processing" // 変換パイプライン失敗 (decode/canvas/heic 等)
  | "upload_put" // presigned PUT アップロード失敗
  | "uncaught" // window.onerror (未捕捉 JS エラー)
  | "unhandled_rejection" // 未処理 Promise reject
  | "chunk_load"; // 動的 import のチャンクロード失敗

/** 発生箇所ラベル。自由文字列にせず固定集合で運用しノイズを防ぐ。 */
export type ErrorContext =
  | "gallery-thumb"
  | "photo-detail-view"
  | "photo-detail-thumb"
  | "dashboard-thumb"
  | "done-thumb"
  | "avatar"
  | "pipeline" // 送信時の本加工パイプライン
  | "preview" // 送信前のサムネプレビュー生成
  | "r2-put"
  | "i18n-catalog"
  | "global";

/** image_render 用: 壊れた画像の種別。 */
export type ImageResource = "thumb" | "original" | "avatar";

/** upload_put 用: どちらの PUT が失敗したか。 */
export type UploadTarget = "original" | "thumb";

/** GA4 の client_error イベントに送るパラメータ全体。 */
export interface ClientErrorParams {
  error_kind: ErrorKind;
  context: ErrorContext;
  /** location.pathname を正規化したもの(handle/photoId はマスク、search/hash は除去)。 */
  page_path: string;
  /** Error.name (例 "EncodingError" "TypeError")。<= 40 文字。 */
  error_name?: string;
  /** Error.message をサニタイズ + 100 文字に切り詰めたもの。 */
  error_message?: string;
  resource?: ImageResource;
  target?: UploadTarget;
  /** R2 の HTTP ステータス(取得できた場合のみ)。 */
  http_status?: number;
}

/** 呼び出し側の入力。`page_path` はヘルパー内で自動補完する。 */
export type ClientErrorInput = Omit<ClientErrorParams, "page_path">;

// ---- 制約・サニタイズ ----

const EVENT_NAME = "client_error";
const MAX_MESSAGE = 100; // GA4 の文字列パラメータ上限
const MAX_NAME = 40;
const DEDUP_LIMIT = 5;

/** キー(kind|context|name|message)ごとの送信回数。1 タブ内で保持。 */
const sentCounts = new Map<string, number>();

/** message から署名付き URL 等を除去し、改行を潰して 100 文字に切り詰める。 */
function sanitizeMessage(msg: string | undefined): string | undefined {
  if (!msg) return undefined;
  const cleaned = msg
    .replace(/https?:\/\/\S+/gi, "[url]") // presigned URL の署名クエリごとマスク
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, MAX_MESSAGE) || undefined;
}

/**
 * location.pathname を計測用に正規化する。
 * handle / photoId を含むパスは `*` にマスクして個別識別子を送らない。
 */
function sanitizePath(pathname: string): string {
  if (pathname.startsWith("/send/")) {
    const sub = pathname.slice("/send/".length).split("/").slice(1).join("/");
    return sub ? `/send/*/${sub}` : "/send/*";
  }
  if (pathname.startsWith("/gallery/")) return "/gallery/*";
  return pathname;
}

/** 任意の throw 値から error_name / error_message を安全に取り出す。 */
export function extractError(
  err: unknown,
): Pick<ClientErrorParams, "error_name" | "error_message"> {
  if (err instanceof Error) {
    // err.name は常に非空文字列なので slice のみでよい (空チェック不要)
    return { error_name: err.name.slice(0, MAX_NAME), error_message: sanitizeMessage(err.message) };
  }
  if (err == null) return {};
  return { error_message: sanitizeMessage(String(err)) };
}

// ---- 送信 ----

/**
 * SPA のルート変化ごとに page_view を送る。
 *
 * `page_location` は `origin + サニタイズ済み pathname` にする。クエリを落とすことで
 * 送信URLのアクセスキー (R16) を GA に残さず、handle / photoId もマスクされる。
 * `set` で既定値を更新するので、以降の client_error も同じ値を持つ。
 */
export function trackPageView(pathname: string): void {
  const page_location = window.location.origin + sanitizePath(pathname);
  alog.log("page_view", page_location);
  if (typeof window.gtag !== "function") return;
  window.gtag("set", { page_location });
  window.gtag("event", "page_view");
}

/**
 * client_error イベントを送る。`page_path` は内部で現在パスから補完する。
 */
export function trackClientError(input: ClientErrorInput): void {
  const params: ClientErrorParams = {
    ...input,
    page_path: sanitizePath(window.location.pathname),
  };
  // undefined のキーは GA に空値を残さないよう除去
  for (const k of Object.keys(params) as (keyof ClientErrorParams)[]) {
    if (params[k] === undefined) delete params[k];
  }

  const dedupeKey = `${params.error_kind}|${params.context}|${params.target ?? ""}|${params.http_status ?? ""}|${params.error_name ?? ""}|${params.error_message ?? ""}`;
  const count = sentCounts.get(dedupeKey) ?? 0;

  // 上限超過分も含め、送信内容は常に debugLog に出す(実機デバッグ用)
  alog.log("client_error", params, `(#${count + 1})`);

  if (count >= DEDUP_LIMIT) return;
  sentCounts.set(dedupeKey, count + 1);

  if (!import.meta.env.PROD) return;
  if (typeof window.gtag !== "function") return;
  window.gtag("event", EVENT_NAME, params);
}

/** (context, resource) ごとに生成済みハンドラをキャッシュし、参照を安定させる。 */
const imageErrorHandlers = new Map<string, ReactEventHandler<HTMLImageElement>>();

/**
 * `<img onError>` に渡すハンドラを作る。R2 presigned GET 失敗を image_render として計測する。
 * 例: `<img onError={onImageError("gallery-thumb", "thumb")} />`
 * GA 送信のみで src は差し替えないため 1 回発火(再レンダーの重複はデデュープで吸収)。
 *
 * (context, resource) は定数リテラルなので、ハンドラをキャッシュして参照を安定させる。
 * レンダーごとのクロージャ生成と、React による onError リスナの張り替え
 * (onError は非バブリングで DOM に直付けされる) を避けるため。
 */
export function onImageError(
  context: ErrorContext,
  resource: ImageResource,
): ReactEventHandler<HTMLImageElement> {
  const key = `${context}|${resource}`;
  let handler = imageErrorHandlers.get(key);
  if (!handler) {
    handler = () => trackClientError({ error_kind: "image_render", context, resource });
    imageErrorHandlers.set(key, handler);
  }
  return handler;
}

/** 動的 import のチャンクロード失敗を message から判定する。 */
function isChunkLoadError(reason: unknown): boolean {
  const msg = reason instanceof Error ? reason.message : String(reason ?? "");
  return /dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(msg);
}

// ---- gtag.js のロード ----

/**
 * GA4 の測定 ID。秘密情報ではない (計測タグとして誰でも閲覧できる) ため定数で持つ。
 * dotenvx 管理の `.env` に置いても公開ビルドに素で焼かれる値なので、env 変数にはしない。
 */
const GA_MEASUREMENT_ID = "G-BE16TKNVZ5";

/** ローカルで動かしているホストか (E2E / vite dev / vite preview / LAN 実機確認)。 */
function isLocalHost(): boolean {
  const h = window.location.hostname;
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "[::1]" ||
    h.endsWith(".local") ||
    /^(10|127)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

/** `import.meta.env.PROD` だけだと dist のローカル配信で漏れるのでホスト名でも弾く。 */
function shouldLoadGaTag(): boolean {
  return import.meta.env.PROD && !isLocalHost();
}

/**
 * gtag.js を読み込み `window.gtag` を用意する。
 * 初回の page_view は送らせず、{@link trackPageView} に一本化する。
 */
function loadGaTag(): void {
  window.dataLayer = window.dataLayer ?? [];
  function gtagCommand(): void {
    // biome-ignore lint/complexity/noArguments: gtag.js は dataLayer の要素が Arguments かどうかでコマンドを識別する (rest 引数だと配列になり無視される)
    window.dataLayer?.push(arguments);
  }
  window.gtag = gtagCommand;

  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

/**
 * グローバルエラーハンドラを登録する。App の外側(React 非依存)で 1 回だけ呼ぶ。
 * リソースロードエラー(<img> 等)は個別 onError で扱うためここでは拾わない。
 */
export function initAnalytics(): void {
  if (shouldLoadGaTag()) loadGaTag();
  else alog.log("gtag.js skipped (dev build or local host)");

  window.addEventListener("error", (event) => {
    // ErrorEvent 以外(リソースエラー)は個別 onError 側の担当
    if (!(event instanceof ErrorEvent)) return;
    const { error_name, error_message } = extractError(event.error ?? event.message);
    trackClientError({ error_kind: "uncaught", context: "global", error_name, error_message });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const { error_name, error_message } = extractError(event.reason);
    const error_kind = isChunkLoadError(event.reason) ? "chunk_load" : "unhandled_rejection";
    trackClientError({ error_kind, context: "global", error_name, error_message });
  });
}
