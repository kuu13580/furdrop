// 送信キー (受信URLの ?k= に乗せる短い乱数文字列) の生成。
// nanoid と同じ URL-safe アルファベット (64 文字) + crypto.getRandomValues を使用。
// デフォルト 21 文字 = 126 bit のエントロピー (nanoid デフォルトと一致)。
const URL_SAFE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const DEFAULT_LENGTH = 21;

export function generateSendKey(length: number = DEFAULT_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += URL_SAFE_ALPHABET[bytes[i] & 63];
  }
  return out;
}
