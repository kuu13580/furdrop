// ZIP を手で読むテストヘルパー。
// zip.js の ZipReader を使わないのは、writer が書いたバイト列を writer と同じ実装で
// 読み返しても「自己整合しているか」しか分からないため。セントラルディレクトリを直接辿り、
// CRC32 も自分で計算して照合する。
import { expect } from "vitest";

/** セントラルディレクトリを辿ってエントリを取り出す */
export async function readZip(zip: Uint8Array): Promise<{ filename: string; data: Uint8Array }[]> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  expect(eocd).toBeGreaterThanOrEqual(0);

  let count = view.getUint16(eocd + 10, true);
  let cdOffset = view.getUint32(eocd + 16, true);
  // ZIP64 のときは EOCD の値がマスクされているので ZIP64 EOCD から読み直す
  if (count === 0xffff || cdOffset === 0xffffffff) {
    const locator = eocd - 20;
    expect(view.getUint32(locator, true)).toBe(0x07064b50);
    const z64 = Number(view.getBigUint64(locator + 8, true));
    expect(view.getUint32(z64, true)).toBe(0x06064b50);
    count = Number(view.getBigUint64(z64 + 32, true));
    cdOffset = Number(view.getBigUint64(z64 + 48, true));
  }

  const out: { filename: string; data: Uint8Array }[] = [];
  let offset = cdOffset;
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(offset, true)).toBe(0x02014b50);
    const crc = view.getUint32(offset + 16, true);
    let compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    let localOffset = view.getUint32(offset + 42, true);
    const filename = new TextDecoder().decode(zip.subarray(offset + 46, offset + 46 + nameLength));
    if (compressedSize === 0xffffffff || localOffset === 0xffffffff) {
      const z64 = findExtraField(zip, offset + 46 + nameLength, extraLength, 0x0001);
      expect(z64).toBeGreaterThanOrEqual(0);
      // ZIP64 拡張は uncompressedSize, compressedSize, localOffset の順で必要な分だけ入る
      let cursor = z64;
      if (view.getUint32(offset + 24, true) === 0xffffffff) cursor += 8;
      if (compressedSize === 0xffffffff) {
        compressedSize = Number(view.getBigUint64(cursor, true));
        cursor += 8;
      }
      if (localOffset === 0xffffffff) localOffset = Number(view.getBigUint64(cursor, true));
    }
    offset += 46 + nameLength + extraLength + commentLength;

    expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
    // store (level: 0) なので圧縮メソッドは 0
    expect(view.getUint16(localOffset + 8, true)).toBe(0);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = zip.slice(dataStart, dataStart + compressedSize);
    expect(crc32(data)).toBe(crc);
    out.push({ filename, data });
  }
  return out;
}

/** extra field 群から指定 ID のデータ開始位置を返す (見つからなければ -1) */
function findExtraField(zip: Uint8Array, start: number, length: number, id: number): number {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let offset = start;
  const end = start + length;
  while (offset + 4 <= end) {
    const size = view.getUint16(offset + 2, true);
    if (view.getUint16(offset, true) === id) return offset + 4;
    offset += 4 + size;
  }
  return -1;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC32_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** ローカルファイルヘッダの version needed to extract。45 = ZIP64 */
export function versionNeededToExtract(zip: Uint8Array): number {
  return zip[4] | (zip[5] << 8);
}

/** ローカルファイルヘッダの extra field に ZIP64 (0x0001) があるか */
export function hasZip64ExtraField(zip: Uint8Array): boolean {
  const nameLength = zip[26] | (zip[27] << 8);
  const extraLength = zip[28] | (zip[29] << 8);
  let offset = 30 + nameLength;
  const end = offset + extraLength;
  while (offset + 4 <= end) {
    const id = zip[offset] | (zip[offset + 1] << 8);
    if (id === 0x0001) return true;
    offset += 4 + (zip[offset + 2] | (zip[offset + 3] << 8));
  }
  return false;
}
