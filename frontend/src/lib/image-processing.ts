import piexif from "piexifjs";
import { debugLog } from "./debug-log";
import {
  drawWatermarkElements,
  ensureWatermarkFonts,
  type WatermarkRenderElement,
} from "./watermark";

const log = debugLog.scope("image");

/**
 * 画像処理パイプライン:
 *   PNG/HEIC → JPEG変換 → EXIF書換 → 透かし → サムネイル生成
 *
 * 全てクライアントサイドで完結。サーバーにオリジナル画像を送らない。
 */

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

/** 入力がHEIC系か判定 (MIME / 拡張子)。File も SelectedFileMeta も渡せる */
export function isHeic(meta: { name: string; type: string }): boolean {
  const type = meta.type.toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  return /\.hei[cf]$/i.test(meta.name);
}

/**
 * File を ImageBitmap に decode する。
 * - JPEG / PNG / ネイティブ HEIC 対応ブラウザ (Safari 17+, Chrome 120+) はそのまま decode
 * - createImageBitmap が失敗し、かつ HEIC だった場合のみ heic-to で JPEG 変換して再試行
 *   (JPEG/PNG が decode 不能なら壊れているので諦めて null を返す)
 */
export async function tryLoadBitmap(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    if (!isHeic(file)) return null;
    try {
      // File は Blob かつ name/type を持つので bytes・meta の両方として渡せる
      const jpeg = await normalizeToJpeg(file, file);
      return await createImageBitmap(jpeg, { imageOrientation: "from-image" });
    } catch {
      return null;
    }
  }
}

/** Blob を Canvas 経由で JPEG に変換する共通処理 */
async function blobToJpegViaCanvas(blob: Blob): Promise<Blob> {
  const img = await decodeImage(blob);
  try {
    return await withCanvas(img.width, img.height, (canvas) => {
      const ctx = getContext2d(canvas);
      // JPEGはアルファを持てないため、透過部分を白埋め (デフォルト黒になるのを防ぐ)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, img.width, img.height);
      ctx.drawImage(img.source, 0, 0);
      return canvasToBlob(canvas, "image/jpeg", 0.92);
    });
  } finally {
    img.close();
  }
}

/**
 * JPEG以外はJPEGに変換する。JPEGはそのまま返す。
 * bytes は Blob で、元ファイル名・MIME は meta で受け取る (HEIC は拡張子でも判定するため)。
 */
export async function normalizeToJpeg(
  blob: Blob,
  meta: { name: string; type: string },
): Promise<Blob> {
  if (meta.type.toLowerCase() === "image/jpeg") return blob;

  if (isHeic(meta)) {
    // モダンブラウザ (Safari 17+, Chrome 120+) は HEIC をネイティブデコード可能。
    // まず createImageBitmap を試し、失敗時のみ heic-to にフォールバック。
    try {
      return await blobToJpegViaCanvas(blob);
    } catch (err) {
      log.dumpError(`HEIC native decode 失敗、heic-to にフォールバック (${meta.name})`, err);
      const { heicTo } = await import("heic-to");
      return await heicTo({ blob, type: "image/jpeg", quality: 0.92 });
    }
  }

  // PNG等をCanvasでJPEGに変換
  return blobToJpegViaCanvas(blob);
}

/** 送信者が入力したテキストをEXIFのカメラモデル欄 (IFD0.Model) に書き込む */
export async function embedSenderInfoInExif(jpegBlob: Blob, senderText: string): Promise<Blob> {
  if (!senderText) return jpegBlob;

  const dataUrl = await blobToDataUrl(jpegBlob);
  let exifObj: piexif.ExifDict;
  try {
    exifObj = piexif.load(dataUrl);
  } catch {
    exifObj = { "0th": {}, Exif: {}, GPS: {} };
  }
  exifObj["0th"] ??= {};
  exifObj["0th"][piexif.ImageIFD.Model] = utf8ToBinaryString(senderText);
  const exifBytes = piexif.dump(exifObj);
  const newDataUrl = piexif.insert(exifBytes, dataUrl);
  return dataUrlToBlob(newDataUrl);
}

/**
 * 文字列を UTF-8 バイト列を Latin1 文字列として表現したものに変換する。
 * piexifjs は最終的に btoa で base64 化するため、コードポイントが 0-255 に収まる必要がある。
 * 日本語など非 Latin1 文字をそのまま渡すと btoa が例外を投げるので、UTF-8 バイト列に展開する。
 */
function utf8ToBinaryString(text: string): string {
  return Array.from(new TextEncoder().encode(text), (b) => String.fromCharCode(b)).join("");
}

/**
 * EXIFのGPS（位置情報）を除去する。プライバシーポリシー第2.2.3項に基づく既定処理。
 * EXIFセグメント自体がない場合や読み取れない場合はそのまま返す。
 */
export async function stripExifGps(jpegBlob: Blob): Promise<Blob> {
  let dataUrl: string;
  try {
    dataUrl = await blobToDataUrl(jpegBlob);
  } catch {
    return jpegBlob;
  }
  let exifObj: piexif.ExifDict;
  try {
    exifObj = piexif.load(dataUrl);
  } catch {
    return jpegBlob;
  }
  if (!exifObj.GPS || Object.keys(exifObj.GPS).length === 0) {
    return jpegBlob;
  }
  exifObj.GPS = {};
  const exifBytes = piexif.dump(exifObj);
  const newDataUrl = piexif.insert(exifBytes, dataUrl);
  return dataUrlToBlob(newDataUrl);
}

/**
 * Canvas 2D APIで透かし要素群を描画した加工済みJPEGを返す。
 * 副産物として寸法も返す（サーバー側に送るため）
 */
export async function applyWatermark(
  jpegBlob: Blob,
  elements: WatermarkRenderElement[],
): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await decodeImage(jpegBlob);
  await ensureWatermarkFonts(elements);
  try {
    const width = img.width;
    const height = img.height;
    return await withCanvas(width, height, async (canvas) => {
      const ctx = getContext2d(canvas);
      // JPEG出力時に透過が黒になるのを防ぐ
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img.source, 0, 0);
      drawWatermarkElements(ctx, width, height, elements);
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
      return { blob, width, height };
    });
  } finally {
    img.close();
  }
}

/** JPEGの寸法を取得（再エンコードしないのでEXIFは維持される） */
export async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const img = await decodeImage(blob);
  try {
    return { width: img.width, height: img.height };
  } finally {
    img.close();
  }
}

/** 長辺400px, 品質0.7のサムネイルJPEGを生成 */
export async function generateThumbnail(jpegBlob: Blob): Promise<Blob> {
  const img = await decodeImage(jpegBlob);
  try {
    const maxSize = 400;
    const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    return await withCanvas(w, h, (canvas) => {
      const ctx = getContext2d(canvas);
      ctx.drawImage(img.source, 0, 0, w, h);
      return canvasToBlob(canvas, "image/jpeg", 0.7);
    });
  } finally {
    img.close();
  }
}

// ========== internal helpers ==========

function supportsOffscreen(): boolean {
  return typeof OffscreenCanvas !== "undefined";
}

/**
 * Blob を `<img>` 要素経由でデコードする。
 *
 * iOS Safari では `createImageBitmap` が `close()` してもデコードバッファを
 * すぐに解放せず、大量の高解像度画像を処理すると累積でメモリ上限に達し、
 * ある枚数以降のデコードが一律 "The source image could not be decoded" で
 * 失敗する既知の不具合がある。GC で回収されやすい `<img>` + objectURL 経路を
 * 使うことでこれを回避する。
 *
 * EXIF 回転は `<img>` のデフォルト `image-orientation: from-image` で適用され、
 * `naturalWidth` / `naturalHeight` は回転後の寸法を返すため、
 * `createImageBitmap(blob, { imageOrientation: "from-image" })` と等価に扱える。
 * 使用後は必ず `close()` で objectURL を解放すること。
 */
interface DecodedImage {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  close(): void;
}

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  // 主経路: <img> + objectURL。iOS Safari で createImageBitmap がデコードバッファを
  // 解放しない問題 (#75) を避けるため、こちらを優先する。
  try {
    return await decodeViaImgElement(blob);
  } catch (err) {
    // <img>.decode() は超高解像度画像 (デコード後 RGBA がブラウザの 1 枚あたりの
    // デコード上限を超える) で EncodingError を返す。createImageBitmap は上限が緩い
    // 別経路なのでフォールバックする。実寸は decode 成功後にしか分からないため、
    // 原因の確定的な内訳 (画素数・デコード後バイト) は成功ログ側に出す。
    log.warn(
      `<img>.decode() 失敗 → createImageBitmap にフォールバック (${describeDecodeError(err)}, type=${blob.type}, file=${formatBytes(blob.size)})`,
    );
    try {
      const decoded = await decodeViaCreateImageBitmap(blob);
      log.log(
        `createImageBitmap フォールバック成功: ${decoded.width}x${decoded.height} ${formatDecodeFootprint(decoded.width, decoded.height)} — <img> のデコード上限超過が原因`,
      );
      return decoded;
    } catch (err2) {
      log.dumpError("createImageBitmap フォールバックも失敗 (この端末ではデコード不能)", err2);
      throw err2;
    }
  }
}

/** `<img>` 要素 + objectURL でデコードする (iOS のメモリ解放に優れる主経路)。 */
async function decodeViaImgElement(blob: Blob): Promise<DecodedImage> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  return {
    source: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    close() {
      URL.revokeObjectURL(url);
      img.src = "";
    },
  };
}

/**
 * `createImageBitmap` でデコードする (フォールバック)。
 * `imageOrientation: "from-image"` で EXIF 回転を適用し、`<img>` 経路と寸法を揃える。
 */
async function decodeViaCreateImageBitmap(blob: Blob): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    close() {
      bitmap.close();
    },
  };
}

/** Error を `Name: message` 形式に整形する (ログ用)。 */
function describeDecodeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

/** バイト数を人間可読 (KiB/MiB) に整形する。 */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MiB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KiB`;
  return `${bytes}B`;
}

/**
 * 画素数とデコード後 (RGBA) のメモリ占有量を整形する。
 * <img>.decode() が EncodingError になる主因 = この占有量がブラウザの 1 枚あたりの
 * デコード上限を超えること、を一目で読み取れるようにする。
 */
function formatDecodeFootprint(width: number, height: number): string {
  const megapixels = (width * height) / 1_000_000;
  const rgbaBytes = width * height * 4;
  return `(${megapixels.toFixed(1)}MP, デコード後 ≈${formatBytes(rgbaBytes)} RGBA)`;
}

/**
 * w×h の Canvas を作って fn に渡し、終了後に必ずバッキングストアを解放する。
 * iOS/Android では多数の大きな Canvas を連続生成するとデコード/描画用メモリが
 * 逼迫し EncodingError 等を招くため、使い終わったら 0×0 にして回収を早める。
 */
async function withCanvas<T>(
  w: number,
  h: number,
  fn: (canvas: AnyCanvas) => Promise<T>,
): Promise<T> {
  const canvas = createCanvas(w, h);
  try {
    return await fn(canvas);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function createCanvas(w: number, h: number): AnyCanvas {
  if (supportsOffscreen()) return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function getContext2d(
  canvas: AnyCanvas,
): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  if (canvas instanceof OffscreenCanvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("OffscreenCanvas 2D context not available");
    return ctx;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");
  return ctx;
}

async function canvasToBlob(canvas: AnyCanvas, type: string, quality: number): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob returned null"))),
      type,
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);base64/)?.[1] ?? "application/octet-stream";
  const binary = atob(base64);
  const u8 = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) u8[i] = binary.charCodeAt(i);
  return new Blob([u8], { type: mime });
}
