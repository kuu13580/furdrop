const GOOGLE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

interface JwtHeader {
  alg: string;
  kid: string;
}

interface JwtPayload {
  sub: string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
  email?: string;
  name?: string;
  picture?: string;
}

/** Base64URL → ArrayBuffer */
function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** PEM → CryptoKey */
async function pemToKey(pem: string): Promise<CryptoKey> {
  const der = base64UrlToArrayBuffer(
    pem
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\s/g, ""),
  );
  // X.509証明書からSPKIを抽出せず、直接importできないため
  // Cloudflare WorkersではX.509をimportRawKeyではなくimportX509で扱う
  // ただしSubtleCryptoにはimportX509がないので、SPKIを手動抽出する代わりに
  // importCertificateの代替としてfetchした証明書をJWK形式に変換する
  //
  // 実際にはCloudflare WorkersのSubtleCryptoはX.509 DER証明書を
  // "spki"フォーマットとして直接importできる
  return crypto.subtle.importKey(
    "spki",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

/** Google公開鍵をフェッチ (キャッシュ付き) */
async function fetchPublicKeys(): Promise<Record<string, string>> {
  // Cloudflare Cache APIでキャッシュ
  const cache = caches.default;
  const cacheKey = new Request(GOOGLE_CERTS_URL);

  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached.json();
  }

  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Google public keys: ${res.status}`);
  }

  // Cache-Controlヘッダーに従ってキャッシュ
  const cacheResponse = new Response(res.body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": res.headers.get("Cache-Control") ?? "max-age=3600",
    },
  });
  await cache.put(cacheKey, cacheResponse.clone());

  return cacheResponse.json();
}

/** Firebase IDトークンを検証し、ペイロードを返す */
export async function verifyFirebaseToken(token: string, projectId: string): Promise<JwtPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  const header: JwtHeader = JSON.parse(new TextDecoder().decode(base64UrlToArrayBuffer(parts[0])));

  if (header.alg !== "RS256") {
    throw new Error(`Unsupported algorithm: ${header.alg}`);
  }

  // 公開鍵を取得
  const keys = await fetchPublicKeys();
  const pem = keys[header.kid];
  if (!pem) {
    throw new Error(`Key not found for kid: ${header.kid}`);
  }

  // 署名検証
  const key = await pemToKey(pem);
  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlToArrayBuffer(parts[2]);

  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, data);
  if (!valid) {
    throw new Error("Invalid signature");
  }

  // ペイロード検証
  const payload: JwtPayload = JSON.parse(
    new TextDecoder().decode(base64UrlToArrayBuffer(parts[1])),
  );
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp <= now) {
    throw new Error("Token expired");
  }

  if (payload.aud !== projectId) {
    throw new Error(`Invalid audience: ${payload.aud}`);
  }

  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error(`Invalid issuer: ${payload.iss}`);
  }

  return payload;
}
