/**
 * API エラーの型と、ユーザー向け文言への解決。
 *
 * `ApiError` はここで定義する (実際の fetch を行う `api.ts` ではなく) 。
 * `api.ts` は Firebase SDK を import 時に初期化するため、そちらに置くと
 * 文言解決を使うだけのコード / ユニットテストまで Firebase を巻き込んでしまう。
 */
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
 * Phase 2 で Lingui を導入する際は、`t` マクロではなく `msg` (MessageDescriptor) の
 * テーブルにして呼び出し時に `i18n._()` で解決すること。下記のテーブルは
 * モジュールロード時に 1 回だけ評価されるため、`t` で包むとロケール切替に追従しない。
 */
export type ErrorContext = "register" | "updateOptions" | "deleteAccount" | "upload";

/** context ごとの code → 文言。未定義の code は COMMON にフォールバックする */
const MESSAGES: Record<ErrorContext, Partial<Record<string, string>>> = {
  register: {
    HANDLE_TAKEN: "このハンドルは既に使われています。別のハンドルを試してください",
    INVALID_REQUEST: "入力内容を確認してください",
  },
  updateOptions: {
    NOT_FOUND: "アカウントが見つかりません。再度ログインしてください",
  },
  deleteAccount: {
    INVALID_REQUEST: "確認用ハンドルが一致しません",
    NOT_FOUND: "アカウントが見つかりません",
  },
  upload: {
    INVALID_KEY:
      "この受信URLは無効です。受信者から最新の受信URL (?k=... 付き) を共有してもらってください",
    FORBIDDEN: "現在この受信者は写真を受け付けていません",
    QUOTA_EXCEEDED: "受信者の保存容量がいっぱいです。受信者に連絡してください",
    NOT_FOUND: "送信の有効期限が切れました。お手数ですが最初からやり直してください",
    INVALID_REQUEST: "送信の有効期限が切れました。お手数ですが最初からやり直してください",
    INVALID_FORMAT: "この画像は送信できません (JPEG 形式ではありません)",
    FILE_TOO_LARGE: "ファイルサイズが上限 (20MB) を超えています",
    RATE_LIMITED:
      "短時間に多くのリクエストが集中したため、不正利用（bot 等）対策により一時的に送信を制限しています。1〜2分ほど時間をおいてからもう一度お試しください。",
  },
};

/** どの context でも共通のフォールバック */
const COMMON: Partial<Record<string, string>> = {
  UNAUTHORIZED: "ログインの有効期限が切れました。もう一度ログインしてください",
  FORBIDDEN: "この操作を行う権限がありません",
  NOT_FOUND: "対象が見つかりません",
  INVALID_REQUEST: "入力内容を確認してください",
  QUOTA_EXCEEDED: "保存容量がいっぱいです",
  RATE_LIMITED: "アクセスが集中しています。少し待ってからもう一度お試しください",
  INTERNAL: "サーバーでエラーが発生しました。時間をおいてもう一度お試しください",
};

const FALLBACK = "エラーが発生しました。時間をおいてもう一度お試しください";
const OFFLINE = "ネットワークに接続できません。通信環境を確認してください";

export function resolveApiError(err: unknown, context: ErrorContext): string {
  if (err instanceof ApiError) {
    return MESSAGES[context][err.code] ?? COMMON[err.code] ?? FALLBACK;
  }
  // fetch 自体の失敗 (オフライン / DNS / CORS) は TypeError で来る
  if (err instanceof TypeError) return OFFLINE;
  return FALLBACK;
}

/**
 * Firebase Auth のエラーをユーザー向け文言に解決する。
 *
 * Firebase SDK の `error.message` は英語の開発者向けテキスト
 * (例: "Firebase: Error (auth/popup-closed-by-user).") なので画面に出さない。
 */
const FIREBASE_MESSAGES: Partial<Record<string, string>> = {
  "auth/popup-closed-by-user": "ログインがキャンセルされました",
  "auth/cancelled-popup-request": "ログインがキャンセルされました",
  "auth/popup-blocked":
    "ポップアップがブロックされました。ブラウザの設定で許可してからお試しください",
  "auth/network-request-failed": OFFLINE,
  "auth/user-disabled": "このアカウントは無効化されています",
  "auth/account-exists-with-different-credential":
    "このアカウントは別のログイン方法で登録されています",
};

const AUTH_FALLBACK = "ログインに失敗しました。時間をおいてもう一度お試しください";

export function resolveAuthError(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  return FIREBASE_MESSAGES[code] ?? AUTH_FALLBACK;
}
