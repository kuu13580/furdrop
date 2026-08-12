import { ApiError } from "./api-error";
import { auth } from "./firebase";
import { getTzOffsetMin } from "./timezone";

const configuredBase = import.meta.env.VITE_API_BASE_URL ?? "";

// 開発時に LAN 経由 (192.168.x.x 等) でアクセスした場合、API ベースURLが
// localhost を指していると「アクセス元の端末自身」を指してしまい Workers に
// 到達できない。ページを開いたホスト名に差し替えて localhost / LAN どちらからも
// 動くようにする (本番ビルドでは localhost を含まないので no-op)。
const BASE_URL =
  import.meta.env.DEV && configuredBase
    ? configuredBase.replace(/\/\/(localhost|127\.0\.0\.1)/, `//${window.location.hostname}`)
    : configuredBase;

export type EmbedMode = "disabled" | "optional" | "required";

async function request<T>(
  path: string,
  options: RequestInit = {},
  authenticated = false,
): Promise<T> {
  const headers = new Headers(options.headers);

  if (authenticated) {
    const user = auth.currentUser;
    if (!user) throw new ApiError(401, "UNAUTHORIZED", "Not logged in");
    const token = await user.getIdToken();
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const code = body?.error?.code ?? "UNKNOWN";
    const message = body?.error?.message ?? res.statusText;
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ========== 送信者 API ==========

export const senderApi = {
  getReceiver: (handle: string) =>
    request<{
      receiver: {
        handle: string;
        display_name: string;
        avatar_url: string | null;
        is_accepting: boolean;
        require_send_key: boolean;
        options: {
          exif_embed_mode: EmbedMode;
          watermark_mode: EmbedMode;
          require_sender_name: boolean;
        };
      };
    }>(`/send/${handle}`),

  createSession: (
    handle: string,
    body: { key?: string; sender_name?: string; photo_count: number },
  ) =>
    request<{ session_id: string; expires_at: number }>(`/send/${handle}/sessions`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  createPhotos: (
    handle: string,
    sessionId: string,
    body: {
      photos: {
        filename: string;
        file_size: number;
        thumb_size: number;
        width: number;
        height: number;
        camera_model?: string;
        watermark_text?: string;
      }[];
    },
  ) =>
    request<{
      uploads: {
        photo_id: string;
        upload_url: string;
        thumb_upload_url: string;
      }[];
      expires_in: number;
    }>(`/send/${handle}/sessions/${sessionId}/photos`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  confirmPhoto: (
    handle: string,
    sessionId: string,
    photoId: string,
    body: { thumb_size: number },
  ) =>
    request<{ photo_id: string; upload_status: string }>(
      `/send/${handle}/sessions/${sessionId}/photos/${photoId}/confirm`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),

  getSession: (handle: string, sessionId: string) =>
    request<{
      session_id: string;
      photos: {
        photo_id: string;
        thumb_url: string | null;
        filename: string | null;
        status: string;
      }[];
    }>(`/send/${handle}/sessions/${sessionId}`),
};

// ========== 認証 API ==========

export const authApi = {
  register: (body: {
    handle: string;
    display_name: string;
    exif_embed_mode?: EmbedMode;
    watermark_mode?: EmbedMode;
    require_sender_name?: boolean;
  }) =>
    request<{
      user: {
        id: string;
        handle: string;
        display_name: string;
        storage_used: number;
        storage_quota: number;
        receive_url: string;
        is_active: boolean;
        exif_embed_mode: EmbedMode;
        watermark_mode: EmbedMode;
        require_sender_name: boolean;
        require_send_key: boolean;
      };
    }>("/auth/register", { method: "POST", body: JSON.stringify(body) }, true),

  getMe: () =>
    request<{
      user: {
        id: string;
        handle: string;
        display_name: string;
        storage_used: number;
        storage_quota: number;
        receive_url: string;
        is_active: boolean;
        exif_embed_mode: EmbedMode;
        watermark_mode: EmbedMode;
        require_sender_name: boolean;
        require_send_key: boolean;
      };
    }>("/auth/me", {}, true),

  updateOptions: (body: {
    exif_embed_mode?: EmbedMode;
    watermark_mode?: EmbedMode;
    require_sender_name?: boolean;
    is_active?: boolean;
    require_send_key?: boolean;
  }) =>
    request<{
      user: {
        id: string;
        handle: string;
        display_name: string;
        storage_used: number;
        storage_quota: number;
        receive_url: string;
        is_active: boolean;
        exif_embed_mode: EmbedMode;
        watermark_mode: EmbedMode;
        require_sender_name: boolean;
        require_send_key: boolean;
      };
    }>("/auth/options", { method: "PATCH", body: JSON.stringify(body) }, true),

  deleteAccount: (body: { confirm_handle: string }) =>
    request<void>("/auth/account", { method: "DELETE", body: JSON.stringify(body) }, true),
};

// ========== 受信者 API ==========

export const receiverApi = {
  listPhotos: (params?: { limit?: number; cursor?: string; tzOffsetMin?: number }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.cursor) query.set("cursor", params.cursor);
    // date_counts の日境界をクライアントのタイムゾーンに合わせる。
    // 呼び出し元が固定したオフセットを渡せるようにしているのは、初回フェッチの
    // 集計とその後のページ・クライアント側の日付キーを必ず同じ境界に揃えるため
    query.set("tz_offset_min", String(params?.tzOffsetMin ?? getTzOffsetMin()));
    const qs = query.toString();
    return request<{
      photos: {
        id: string;
        sender_name: string | null;
        camera_model: string | null;
        file_size: number;
        width: number | null;
        height: number | null;
        thumb_url: string | null;
        created_at: number;
      }[];
      next_cursor: string | null;
      total: number;
      date_counts: { key: string; count: number }[] | null;
      sender_counts: { key: string; count: number }[] | null;
    }>(`/receiver/photos${qs ? `?${qs}` : ""}`, {}, true);
  },

  /** 指定した sender の写真IDを全件返す (空文字列 = 匿名) */
  listPhotoIdsBySender: (sender: string) => {
    const query = new URLSearchParams({ sender });
    return request<{ photo_ids: string[] }>(`/receiver/photo-ids?${query.toString()}`, {}, true);
  },

  /** group を渡すとその表示モードに合わせて prev/next を絞り込む */
  getPhoto: (photoId: string, group?: "none" | "date" | "sender") => {
    const qs = group ? `?group=${group}` : "";
    return request<{
      photo: {
        id: string;
        sender_name: string | null;
        camera_model: string | null;
        file_size: number;
        width: number | null;
        height: number | null;
        thumb_url: string | null;
        view_url: string | null;
        created_at: number;
      };
      prev_id: string | null;
      next_id: string | null;
    }>(`/receiver/photos/${photoId}${qs}`, {}, true);
  },

  downloadPhoto: (photoId: string, tzOffsetMin?: number) => {
    // DL ファイル名の日時もクライアントのタイムゾーン基準にする
    const query = new URLSearchParams({
      tz_offset_min: String(tzOffsetMin ?? getTzOffsetMin()),
    });
    return request<{
      download_url: string;
      filename: string | null;
      file_size: number;
    }>(`/receiver/photos/${photoId}/download?${query.toString()}`, {}, true);
  },

  deletePhoto: (photoId: string) =>
    request<void>(`/receiver/photos/${photoId}`, { method: "DELETE" }, true),

  batchDeletePhotos: (photoIds: string[]) =>
    request<{ deleted_count: number }>(
      "/receiver/photos",
      {
        method: "DELETE",
        body: JSON.stringify({ photo_ids: photoIds }),
      },
      true,
    ),

  getQuota: () =>
    request<{
      storage_used: number;
      storage_quota: number;
      usage_percent: number;
      photo_count: number;
    }>("/receiver/quota", {}, true),
};

export { ApiError };
