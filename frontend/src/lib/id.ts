/**
 * crypto.randomUUID() のフォールバック付きラッパー。
 *
 * crypto.randomUUID はセキュアコンテキスト (HTTPS / localhost) でのみ利用可能。
 * LAN の IP へ http で直アクセスする実機テスト等の非セキュアコンテキストでは
 * undefined になるため、その場合は簡易的な一意 ID を生成する。
 * 用途は UI のリストキー等であり、暗号学的強度は不要。
 */
export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
