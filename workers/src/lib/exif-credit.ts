import piexif from "piexifjs";

/**
 * R17: 受信者がダウンロードする写真の EXIF に送信者名を記録する。
 *
 * 一括 DL をサーバー側の ZIP ストリームに移したので、書き込みもここで行う。
 * R2 に保存されているオリジナルは送信者が送ったバイト列のまま変わらない
 * (差し替えるのはレスポンスに流すバイト列だけ)。
 */

/** 記録先の EXIF 欄。`artist_model` は Google フォト等で表示させたい場合に選ぶ */
export type ExifCreditMode = "none" | "artist" | "artist_model";

export const EXIF_CREDIT_MODES: readonly ExifCreditMode[] = ["none", "artist", "artist_model"];

export function isExifCreditMode(v: unknown): v is ExifCreditMode {
  return typeof v === "string" && (EXIF_CREDIT_MODES as readonly string[]).includes(v);
}

/**
 * ストリームの先頭から読み込むバイト数の上限。
 *
 * EXIF の APP1 は仕様上 64KB 以下だが、その前に ICC プロファイル (APP2) が
 * 複数セグメントで入ることがあるので余裕を持たせる。この範囲に SOS が現れない
 * 写真は差し替えを諦めて無加工で流す (R17: 失敗しても DL 自体は成立させる)。
 */
export const EXIF_HEAD_MAX_BYTES = 256 * 1024;

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
 * JPEG の先頭バイト列に APP1 (EXIF) を差し替えた新しい先頭バイト列を返す。
 * 差し替え不要・不可能なときは null (呼び出し側は無加工で流す)。
 *
 * 差し替え後の全体サイズは `object.size - head.length + result.length` で確定するので、
 * ZIP エントリに正確な uncompressedSize を宣言できる (宣言しないと zip.js は
 * サイズ不明とみなして全エントリを ZIP64 にする)。
 */
export function spliceExifCredit(
  head: Uint8Array,
  senderName: string | null | undefined,
  mode: ExifCreditMode,
): Uint8Array | null {
  if (mode === "none") return null;
  const credit = buildCreditText(senderName);
  if (!credit) return null;
  if (head[0] !== 0xff || head[1] !== 0xd8) return null;

  const scan = scanSegments(head);
  const existing = findExifSegment(head, scan.segments);
  // 既存 APP1 が見つかっていればその範囲を置き換えるだけなので、後続セグメントを
  // 取りこぼしていても安全。挿入位置を決める必要があるとき (EXIF が無いとき) だけ
  // SOS まで届いていることを要求する
  if (!existing && !scan.reachedScanStart) return null;

  let dict: piexif.ExifDict;
  if (existing) {
    try {
      dict = piexif.load(bytesToBinary(head.subarray(existing.start + 4, existing.end)));
    } catch {
      // piexif が読めない EXIF (MakerNote が濃いファイル等) を Artist だけの新セグメントで
      // 置き換えると Orientation や撮影日時が無言で消える。無加工で流す方を選ぶ
      return null;
    }
  } else {
    dict = { "0th": {}, Exif: {}, GPS: {} };
  }

  dict["0th"] ??= {};
  const value = utf8ToBinaryString(credit);
  dict["0th"][piexif.ImageIFD.Artist] = value;
  // Model は元のカメラ機種名を潰すので、受信者が明示的に選んだときだけ書く
  if (mode === "artist_model") dict["0th"][piexif.ImageIFD.Model] = value;

  const segment = buildApp1Segment(binaryToBytes(piexif.dump(dict)));
  const cutStart = existing ? existing.start : exifInsertOffset(scan.segments);
  const cutEnd = existing ? existing.end : cutStart;

  const out = new Uint8Array(head.length - (cutEnd - cutStart) + segment.length);
  out.set(head.subarray(0, cutStart), 0);
  out.set(segment, cutStart);
  out.set(head.subarray(cutEnd), cutStart + segment.length);
  return out;
}

// ========== internal ==========

const EXIF_ID = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

type Segment = { marker: number; start: number; end: number };

/**
 * JPEG のマーカーセグメントを走査する。
 * SOS (0xDA) 以降は圧縮データなので打ち切る。
 *
 * `reachedScanStart` は SOS / EOI に到達したか。先頭バッファが途中で切れている
 * ケースと区別するために返す。
 */
function scanSegments(bytes: Uint8Array): { segments: Segment[]; reachedScanStart: boolean } {
  const segments: Segment[] = [];
  let i = 2; // SOI をスキップ
  while (i + 3 < bytes.length) {
    // 0xFF のフィルバイトは読み飛ばす (仕様上マーカーの前に何個あってもよい)
    if (bytes[i] === 0xff && bytes[i + 1] === 0xff) {
      i += 1;
      continue;
    }
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1];
    // 長さフィールドを持たない単独マーカー
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return { segments, reachedScanStart: true };
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2) break;
    const end = i + 2 + length;
    if (end > bytes.length) break;
    segments.push({ marker, start: i, end });
    i = end;
  }
  return { segments, reachedScanStart: false };
}

function findExifSegment(bytes: Uint8Array, segments: Segment[]): Segment | null {
  for (const seg of segments) {
    if (seg.marker !== 0xe1) continue;
    if (EXIF_ID.every((b, k) => bytes[seg.start + 4 + k] === b)) return seg;
  }
  return null;
}

/** EXIF セグメントが無いときの挿入位置。JFIF (APP0) があればその直後に置く */
function exifInsertOffset(segments: Segment[]): number {
  const first = segments[0];
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
