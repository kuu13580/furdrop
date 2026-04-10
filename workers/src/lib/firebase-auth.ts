import { Auth, WorkersKVStoreSingle } from "firebase-auth-cloudflare-workers";
import type { Env } from "../types";

/**
 * Firebase IDトークンを検証し、デコードされたトークンを返す。
 * 公開鍵はKVにキャッシュされる。
 */
export async function verifyFirebaseToken(token: string, env: Env) {
  const auth = Auth.getOrInitialize(
    env.FIREBASE_PROJECT_ID,
    WorkersKVStoreSingle.getOrInitialize(env.PUBLIC_JWK_CACHE_KEY, env.PUBLIC_JWK_CACHE_KV),
  );
  return auth.verifyIdToken(token);
}
