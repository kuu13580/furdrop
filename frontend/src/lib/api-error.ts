/**
 * API エラーの型と、ユーザー向け文言への解決。
 *
 * `ApiError` はここで定義する (実際の fetch を行う `api.ts` ではなく) 。
 * `api.ts` は Firebase SDK を import 時に初期化するため、そちらに置くと
 * 文言解決を使うだけのコード / ユニットテストまで Firebase を巻き込んでしまう。
 */
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "./i18n";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * API エラーをユーザー向け文言に解決する。
 *
 * サーバーの `error.message` は**開発者向けの英語テキスト**であり、そのまま画面に
 * 出さない。表示文言はここで `error.code` から組み立てる。これにより
 * (1) UI の言語がサーバー実装から独立し、i18n 対応がクライアント側で完結する
 * (2) 内部実装の details がユーザーに漏れない。
 *
 * 同じ `code` でもコンテキストによって意味が変わる (例: `NOT_FOUND` が
 * 「写真が見つからない」なのか「セッションが期限切れ」なのか) ため、
 * 呼び出し側が `context` を渡して解決する。
 *
 * テーブルはモジュールロード時に 1 回だけ評価されるので、`t` ではなく `msg`
 * (MessageDescriptor) で持ち、解決時に `i18n._()` を通す。
 */
export type ErrorContext =
  | "register"
  | "updateOptions"
  | "deleteAccount"
  // 送信フローは段階ごとに分ける。sender.ts は同じ code (FORBIDDEN / INVALID_REQUEST /
  // NOT_FOUND) を段階ごとに別の意味で返すため、まとめると誤った案内になる
  | "createSession"
  | "createPhotos"
  | "uploadPhoto"
  | "processImage";

const SESSION_EXPIRED_MESSAGE = msg`送信の有効期限が切れました。お手数ですが最初からやり直してください`;
const RATE_LIMIT_MESSAGE = msg`短時間に多くのリクエストが集中したため、不正利用（bot 等）対策により一時的に送信を制限しています。1〜2分ほど時間をおいてからもう一度お試しください。`;
const RECEIVER_QUOTA_MESSAGE = msg`受信者の保存容量がいっぱいです。受信者に連絡してください`;
const FILE_TOO_LARGE_MESSAGE = msg`ファイルサイズが上限 (20MB) を超えています`;

/** context ごとの code → 文言。未定義の code は COMMON にフォールバックする */
const MESSAGES: Record<ErrorContext, Partial<Record<string, MessageDescriptor>>> = {
  register: {
    HANDLE_TAKEN: msg`このハンドルは既に使われています。別のハンドルを試してください`,
    INVALID_REQUEST: msg`入力内容を確認してください`,
  },
  updateOptions: {
    NOT_FOUND: msg`アカウントが見つかりません。再度ログインしてください`,
  },
  deleteAccount: {
    INVALID_REQUEST: msg`確認用ハンドルが一致しません`,
    NOT_FOUND: msg`アカウントが見つかりません`,
  },
  // --- 送信フロー: セッション作成 (POST /send/:handle/sessions) ---
  createSession: {
    INVALID_KEY: msg`この受信URLは無効です。受信者から最新の受信URL (?k=... 付き) を共有してもらってください`,
    FORBIDDEN: msg`現在この受信者は写真を受け付けていません`,
    NOT_FOUND: msg`この受信URLのユーザーが見つかりません。URLを確認してください`,
    QUOTA_EXCEEDED: RECEIVER_QUOTA_MESSAGE,
    // 受信者が送信者名を必須にしている (R14) ケースが代表的
    INVALID_REQUEST: msg`入力内容を確認してください。受信者が名前の入力を必須にしている場合があります`,
    RATE_LIMITED: RATE_LIMIT_MESSAGE,
  },
  // --- 送信フロー: Presigned URL 発行 (POST .../photos) ---
  createPhotos: {
    NOT_FOUND: SESSION_EXPIRED_MESSAGE,
    FORBIDDEN: SESSION_EXPIRED_MESSAGE,
    QUOTA_EXCEEDED: RECEIVER_QUOTA_MESSAGE,
    FILE_TOO_LARGE: FILE_TOO_LARGE_MESSAGE,
    INVALID_REQUEST: msg`送信内容に問題があります。写真を選び直してもう一度お試しください`,
    RATE_LIMITED: RATE_LIMIT_MESSAGE,
  },
  // --- 送信フロー: R2 への PUT + confirm (PATCH .../confirm) ---
  uploadPhoto: {
    NOT_FOUND: SESSION_EXPIRED_MESSAGE,
    INVALID_FORMAT: msg`この画像は送信できません (JPEG 形式ではありません)`,
    // confirm 時の実サイズ照合ミスマッチ (X08) が代表的
    INVALID_REQUEST: msg`アップロードに失敗しました。もう一度お試しください`,
    QUOTA_EXCEEDED: RECEIVER_QUOTA_MESSAGE,
    FILE_TOO_LARGE: FILE_TOO_LARGE_MESSAGE,
  },
  // --- 送信フロー: クライアント側の画像加工 (API を叩かないので code は付かない) ---
  processImage: {},
};

/** context 固有のフォールバック。API 由来でないエラー (画像加工の失敗など) に効く */
const CONTEXT_FALLBACK: Partial<Record<ErrorContext, MessageDescriptor>> = {
  processImage: msg`画像の変換に失敗しました。別の画像でお試しいただくか、枚数を減らしてください`,
};

/** どの context でも共通のフォールバック */
const COMMON: Partial<Record<string, MessageDescriptor>> = {
  UNAUTHORIZED: msg`ログインの有効期限が切れました。もう一度ログインしてください`,
  FORBIDDEN: msg`この操作を行う権限がありません`,
  NOT_FOUND: msg`対象が見つかりません`,
  INVALID_REQUEST: msg`入力内容を確認してください`,
  QUOTA_EXCEEDED: msg`保存容量がいっぱいです`,
  RATE_LIMITED: msg`アクセスが集中しています。少し待ってからもう一度お試しください`,
  INTERNAL: msg`サーバーでエラーが発生しました。時間をおいてもう一度お試しください`,
};

const FALLBACK = msg`エラーが発生しました。時間をおいてもう一度お試しください`;
const OFFLINE = msg`ネットワークに接続できません。通信環境を確認してください`;

export function resolveApiError(err: unknown, context: ErrorContext): string {
  const fallback = CONTEXT_FALLBACK[context] ?? FALLBACK;
  if (err instanceof ApiError) {
    return i18n._(MESSAGES[context][err.code] ?? COMMON[err.code] ?? fallback);
  }
  // fetch 自体の失敗 (オフライン / DNS / CORS) は TypeError で来る
  if (err instanceof TypeError) return i18n._(OFFLINE);
  return i18n._(fallback);
}

/**
 * Firebase Auth のエラーをユーザー向け文言に解決する。
 *
 * Firebase SDK の `error.message` は英語の開発者向けテキスト
 * (例: "Firebase: Error (auth/popup-closed-by-user).") なので画面に出さない。
 */
const LOGIN_CANCELLED = msg`ログインがキャンセルされました`;

const FIREBASE_MESSAGES: Partial<Record<string, MessageDescriptor>> = {
  "auth/popup-closed-by-user": LOGIN_CANCELLED,
  "auth/cancelled-popup-request": LOGIN_CANCELLED,
  "auth/popup-blocked": msg`ポップアップがブロックされました。ブラウザの設定で許可してからお試しください`,
  "auth/network-request-failed": OFFLINE,
  "auth/user-disabled": msg`このアカウントは無効化されています`,
  "auth/account-exists-with-different-credential": msg`このアカウントは別のログイン方法で登録されています`,
};

const AUTH_FALLBACK = msg`ログインに失敗しました。時間をおいてもう一度お試しください`;

export function resolveAuthError(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  return i18n._(FIREBASE_MESSAGES[code] ?? AUTH_FALLBACK);
}
