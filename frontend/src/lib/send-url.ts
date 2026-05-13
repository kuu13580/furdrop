/**
 * 送信フロー (`/send/:handle/...`) で受信者のアクセスキー `?k=` を引き回すための小さなヘルパー。
 * Landing / Upload / Uploading / Done の 4 ページで URL に常時乗せることで、
 * リロードや URL コピペでも認可が破綻しないようにしている。
 */
export function withKey(path: string, key: string | null | undefined): string {
  if (!key) return path;
  return `${path}?k=${encodeURIComponent(key)}`;
}
