import { auth } from "./firebase";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

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
      };
    }>(`/send/${handle}`),

  createSession: (handle: string, body: { sender_name?: string; photo_count: number }) =>
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
  register: (body: { handle: string; display_name: string }) =>
    request<{
      user: {
        id: string;
        handle: string;
        display_name: string;
        storage_used: number;
        storage_quota: number;
        receive_url: string;
      };
    }>("/auth/register", { method: "POST", body: JSON.stringify(body) }, true),

  getMe: () =>
    request<{
      user: {
        id: string;
        handle: string;
        display_name: string;
        email: string;
        avatar_url: string | null;
        storage_used: number;
        storage_quota: number;
        is_active: number;
        receive_url: string;
      };
    }>("/auth/me", {}, true),
};

// ========== 受信者 API ==========

export const receiverApi = {
  listPhotos: (params?: { limit?: number; cursor?: string }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.cursor) query.set("cursor", params.cursor);
    const qs = query.toString();
    return request<{
      photos: {
        id: string;
        sender_name: string | null;
        camera_model: string | null;
        original_filename: string | null;
        file_size: number;
        width: number | null;
        height: number | null;
        thumb_url: string | null;
        created_at: number;
      }[];
      next_cursor: string | null;
    }>(`/receiver/photos${qs ? `?${qs}` : ""}`, {}, true);
  },

  getPhoto: (photoId: string) =>
    request<{
      photo: {
        id: string;
        sender_name: string | null;
        camera_model: string | null;
        original_filename: string | null;
        file_size: number;
        width: number | null;
        height: number | null;
        thumb_url: string | null;
        created_at: number;
      };
    }>(`/receiver/photos/${photoId}`, {}, true),

  downloadPhoto: (photoId: string) =>
    request<{
      download_url: string;
      filename: string | null;
      file_size: number;
    }>(`/receiver/photos/${photoId}/download`, {}, true),

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
