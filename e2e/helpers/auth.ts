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

/** Workers の /auth/register に POST してユーザー登録 (受信者登録) を済ませる */
export async function registerReceiver(
  user: TestUser,
  handle: string,
  displayName = handle,
): Promise<{ handle: string; sendKey: string; receiveUrl: string }> {
  const res = await fetch(`${WORKERS_URL}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${user.idToken}`,
    },
    body: JSON.stringify({ handle, display_name: displayName }),
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

/** Page 上で signInWithEmailAndPassword を呼んで Firebase Auth セッションを確立する */
export async function signInOnPage(page: Page, user: TestUser): Promise<void> {
  // page.evaluate の中身はブラウザ側で実行される。
  // 動的 import の解決は Vite dev server に任せるので、Node 側の typecheck では
  // モジュール名を解決できない (これは想定通りなので無視する)。
  await page.evaluate(
    async ({ email, password }) => {
      // @ts-expect-error — Vite dev サーバが実行時に解決する
      const { signInWithEmailAndPassword } = await import("firebase/auth");
      // @ts-expect-error — Vite が ESM import で解決する frontend ソース
      const mod = await import("/src/lib/firebase.ts");
      await signInWithEmailAndPassword(mod.auth, email, password);
    },
    { email: user.email, password: user.password },
  );
}
