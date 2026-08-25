// Auth Emulator REST API でユーザーを作って Workers API に register する。
// Frontend の sign-in は別 helper (sign-in.ts) で page.evaluate 経由で実行。
import type { Page } from "@playwright/test";

const EMULATOR_HOST = "127.0.0.1:9099";
const API_KEY = "demo";
const WORKERS_URL = "http://localhost:9000";

type SignUpResponse = {
  idToken: string;
  localId: string;
  email: string;
};

export type TestUser = {
  email: string;
  password: string;
  uid: string;
  idToken: string;
};

/** Emulator にユーザー作成 */
export async function createEmulatorUser(): Promise<TestUser> {
  const email = `e2e-${crypto.randomUUID()}@test.local`;
  const password = "password123";
  const res = await fetch(
    `http://${EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  if (!res.ok) throw new Error(`Auth Emulator signUp 失敗: ${await res.text()}`);
  const data = (await res.json()) as SignUpResponse;
  return { email, password, uid: data.localId, idToken: data.idToken };
}

type EmbedMode = "disabled" | "optional" | "required";

/** Workers の /auth/register に POST してユーザー登録 (受信者登録) を済ませる */
export async function registerReceiver(
  user: TestUser,
  handle: string,
  displayName = handle,
  options?: {
    watermark_mode?: EmbedMode;
    require_sender_name?: boolean;
  },
): Promise<{ handle: string; sendKey: string; receiveUrl: string }> {
  const res = await fetch(`${WORKERS_URL}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${user.idToken}`,
    },
    body: JSON.stringify({ handle, display_name: displayName, ...options }),
  });
  if (!res.ok) {
    throw new Error(`/auth/register 失敗 (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as {
    user: { handle: string; receive_url: string };
  };
  const receiveUrl = data.user.receive_url;
  const sendKey = new URL(receiveUrl, "http://x").searchParams.get("k") ?? "";
  return { handle: data.user.handle, sendKey, receiveUrl };
}

/** /auth/options を PATCH する (受信オプション / 受付停止 / キー opt-out の切替) */
export async function patchOptions(
  user: TestUser,
  options: {
    watermark_mode?: EmbedMode;
    require_sender_name?: boolean;
    is_active?: boolean;
    require_send_key?: boolean;
  },
): Promise<{ receiveUrl: string }> {
  const res = await fetch(`${WORKERS_URL}/auth/options`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${user.idToken}`,
    },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    throw new Error(`/auth/options 失敗 (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { user: { receive_url: string } };
  return { receiveUrl: data.user.receive_url };
}

/** Page 上で signInWithEmailAndPassword を呼んで Firebase Auth セッションを確立する */
export async function signInOnPage(page: Page, user: TestUser): Promise<void> {
  // ブラウザコンテキストでは bare specifier "firebase/auth" を解決できないので、
  // frontend/src/lib/firebase.ts が emulator 接続時にだけ window に露出する
  // __firebaseForTests を経由する (本番ビルドではそもそも値が入らない)。
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { __firebaseForTests?: unknown }).__firebaseForTests ===
      "object",
    null,
    { timeout: 15_000 },
  );
  await page.evaluate(
    async ({ email, password }) => {
      const handle = (
        window as unknown as {
          __firebaseForTests: {
            auth: unknown;
            signInWithEmailAndPassword: (
              auth: unknown,
              email: string,
              password: string,
            ) => Promise<unknown>;
          };
        }
      ).__firebaseForTests;
      await handle.signInWithEmailAndPassword(handle.auth, email, password);
    },
    { email: user.email, password: user.password },
  );
}
