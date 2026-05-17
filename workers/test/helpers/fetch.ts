import { SELF } from "cloudflare:test";

// テストで叩く URL のホスト部はダミーで OK (miniflare 内で routing される)。
const BASE = "https://test.local";

type FetchOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
};

/** SELF.fetch のラッパー: JSON 自動 stringify、Authorization ヘッダ補完など */
export async function apiFetch(path: string, opts: FetchOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { ...opts.headers };
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    if (opts.body instanceof ArrayBuffer || opts.body instanceof Uint8Array) {
      body = opts.body;
    } else if (typeof opts.body === "string") {
      body = opts.body;
    } else {
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
      body = JSON.stringify(opts.body);
    }
  }
  return SELF.fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body,
  });
}

export async function apiJson<T = unknown>(
  path: string,
  opts: FetchOptions = {},
): Promise<{ status: number; body: T }> {
  const res = await apiFetch(path, opts);
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  return { status: res.status, body: body as T };
}
