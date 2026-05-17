import { Auth, type EmulatorEnv, WorkersKVStoreSingle } from "firebase-auth-cloudflare-workers";
import type { Env } from "../types";

/**
 * Firebase IDトークンを検証し、デコードされたトークンを返す。
 * 公開鍵はKVにキャッシュされる。
 *
 * env を第 3 引数に渡しているのは Auth Emulator 対応のため:
 *   env.FIREBASE_AUTH_EMULATOR_HOST が定義されているとき (= テスト時) はライブラリが
 *   emulator の REST API を叩き、未定義のとき (= 本番) は Google 公開鍵を取得する。
 *   本番動作には影響しない (未定義 → 本番経路)。
 */
export async function verifyFirebaseToken(token: string, env: Env) {
  const auth = Auth.getOrInitialize(
    env.FIREBASE_PROJECT_ID,
    WorkersKVStoreSingle.getOrInitialize(env.PUBLIC_JWK_CACHE_KEY, env.PUBLIC_JWK_CACHE_KV),
  );
  return auth.verifyIdToken(token, false, env as EmulatorEnv);
}
