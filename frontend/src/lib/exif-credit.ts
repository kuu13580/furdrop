import piexif from "piexifjs";

/**
 * R17: 受信者がダウンロードした写真に送信者名を EXIF で記録する。
 *
 * 埋め込みは受信者のブラウザで、DL するファイルに対してのみ行う。
 * R2 に保存されているオリジナルは送信者が送ったバイト列のまま変わらない。
 */

/** 記録先の EXIF 欄。`artist_model` は Google フォト等で表示させたい場合に選ぶ */
export type ExifCreditMode = "none" | "artist" | "artist_model";

export const EXIF_CREDIT_MODES: readonly ExifCreditMode[] = ["none", "artist", "artist_model"];

export function isExifCreditMode(v: unknown): v is ExifCreditMode {
  return typeof v === "string" && (EXIF_CREDIT_MODES as readonly string[]).includes(v);
}

/**
 * 送信者名からクレジット文字列を作る。
 *
 * EXIF の Artist / Model は仕様上 ASCII 専用の欄で、非 ASCII は UTF-8 バイトを
 * そのまま流し込む慣習に頼ることになる。英数字ハンドルの送信者なら文字列全体が
 * 純 ASCII に収まるよう、接頭辞はロケールに関わらず英語で固定し、`@` は落とす。
 */
export function buildCreditText(senderName: string | null | undefined): string {
  const name = (senderName ?? "")
    .trim()
    .replace(/^[@＠]+/, "")
    .trim();
  return name ? `Photo by ${name}` : "";
}

/**
 * JPEG の EXIF に送信者名を書き込んだ新しい Blob を返す。
 * 対象外 (mode=none / 名前なし / JPEG でない) のときは元の Blob をそのまま返す。
 */
export async function embedExifCredit(
  jpeg: Blob,
  senderName: string | null | undefined,
  mode: ExifCreditMode,
): Promise<Blob> {
  if (mode === "none") return jpeg;
  const credit = buildCreditText(senderName);
  if (!credit) return jpeg;

  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return jpeg;

  const existing = findExifSegment(bytes);
  const dict: piexif.ExifDict = existing
    ? piexif.load(bytesToBinary(bytes.subarray(existing.start + 4, existing.end)))
    : { "0th": {}, Exif: {}, GPS: {} };

  dict["0th"] ??= {};
  const value = utf8ToBinaryString(credit);
  dict["0th"][piexif.ImageIFD.Artist] = value;
  // Model は元のカメラ機種名を潰すので、受信者が明示的に選んだときだけ書く
  if (mode === "artist_model") dict["0th"][piexif.ImageIFD.Model] = value;

  const segment = buildApp1Segment(binaryToBytes(piexif.dump(dict)));
  const cutStart = existing ? existing.start : exifInsertOffset(bytes);
  const cutEnd = existing ? existing.end : cutStart;

  const out = new Uint8Array(bytes.length - (cutEnd - cutStart) + segment.length);
  out.set(bytes.subarray(0, cutStart), 0);
  out.set(segment, cutStart);
  out.set(bytes.subarray(cutEnd), cutStart + segment.length);
  return new Blob([out], { type: "image/jpeg" });
}

// ========== internal ==========

const EXIF_ID = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

type SegmentRange = { start: number; end: number };

/**
 * JPEG のマーカーセグメントを走査する。
 * SOS (0xDA) 以降は圧縮データなので打ち切る。
 */
function scanSegments(bytes: Uint8Array): { marker: number; start: number; end: number }[] {
  const segments: { marker: number; start: number; end: number }[] = [];
  let i = 2; // SOI をスキップ
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1];
    // 長さフィールドを持たない単独マーカー
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break;
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2) break;
    const end = i + 2 + length;
    if (end > bytes.length) break;
    segments.push({ marker, start: i, end });
    i = end;
  }
  return segments;
}

function findExifSegment(bytes: Uint8Array): SegmentRange | null {
  for (const seg of scanSegments(bytes)) {
    if (seg.marker !== 0xe1) continue;
    if (EXIF_ID.every((b, k) => bytes[seg.start + 4 + k] === b)) return seg;
  }
  return null;
}

/** EXIF セグメントが無いときの挿入位置。JFIF (APP0) があればその直後に置く */
function exifInsertOffset(bytes: Uint8Array): number {
  const first = scanSegments(bytes)[0];
  return first && first.marker === 0xe0 ? first.end : 2;
}

/** piexif.dump() が返す APP1 ペイロードを FFE1 + 長さ 付きのセグメントに包む */
function buildApp1Segment(payload: Uint8Array): Uint8Array {
  const length = payload.length + 2;
  if (length > 0xffff) throw new Error("EXIF segment too large");
  const segment = new Uint8Array(payload.length + 4);
  segment[0] = 0xff;
  segment[1] = 0xe1;
  segment[2] = (length >> 8) & 0xff;
  segment[3] = length & 0xff;
  segment.set(payload, 4);
  return segment;
}

function bytesToBinary(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let out = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
}

function binaryToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 0xff;
  return bytes;
}

/**
 * 文字列を UTF-8 バイト列を Latin1 文字列として表現したものに変換する。
 * piexif は 1 文字 = 1 バイトとして書き出すため、日本語などをそのまま渡すと
 * コードポイントが切り詰められて壊れる。
 */
function utf8ToBinaryString(text: string): string {
  return Array.from(new TextEncoder().encode(text), (b) => String.fromCharCode(b)).join("");
}
