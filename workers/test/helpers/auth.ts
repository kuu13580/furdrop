// Firebase Auth Emulator を直接叩いてテストユーザーを作成し、ID トークンを取得する。
// Workers 側の verifyFirebaseToken はこのトークンを emulator の REST 検証エンドポイントで通す。
// 専用のスタブ JWT を作らず、本物の Firebase Auth フローと同じ経路を使う点が重要。

const EMULATOR_HOST = "127.0.0.1:9099";
// emulator は API key を実質ノーチェック (任意の値で通る) なので "demo" 固定
const API_KEY = "demo";

type SignUpResponse = {
  idToken: string;
  localId: string;
  email: string;
};

/**
 * Emulator に新規ユーザーを作って ID トークンを返す。
 * メールアドレスは UUID を付けて衝突を回避することを推奨。
 */
export async function createEmulatorUser(
  email: string = `user-${crypto.randomUUID()}@test.local`,
  password: string = "password123",
): Promise<{ idToken: string; uid: string; email: string }> {
  const res = await fetch(
    `http://${EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  if (!res.ok) {
    throw new Error(`Auth Emulator signUp failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as SignUpResponse;
  return { idToken: data.idToken, uid: data.localId, email: data.email };
}

export function authHeader(idToken: string): Record<string, string> {
  return { Authorization: `Bearer ${idToken}` };
}
