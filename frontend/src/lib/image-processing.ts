import piexif from "piexifjs";

/**
 * 画像処理パイプライン:
 *   PNG/HEIC → JPEG変換 → EXIF書換 → 透かし → サムネイル生成
 *
 * 全てクライアントサイドで完結。サーバーにオリジナル画像を送らない。
 */

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export type WatermarkPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

/** 白固定 / 黒固定 / 描画領域の明るさから自動選択 */
export type WatermarkColor = "#ffffff" | "#000000" | "auto";

/**
 * 透かしのフォント種別。
 * sans/serif/mono は OS 共通のシステムフォントで、和文も含めて確実に表示される。
 * pop は Google Fonts の Mochiy Pop One (index.html で読み込み済) を使い、未ロード時はシステムの丸ゴシックにフォールバックする。
 */
export type WatermarkFontFamily = "sans" | "serif" | "mono" | "pop";

/**
 * Canvas の ctx.font に渡すフォントスタック。
 * mono は欧文等幅 + 和文等幅 (MS Gothic) を組み合わせて、英日混在でも揃う。
 */
export const WATERMARK_FONT_STACKS: Record<WatermarkFontFamily, string> = {
  sans: '"Hiragino Sans", "Yu Gothic", "Noto Sans JP", system-ui, sans-serif',
  serif: '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", "Times New Roman", serif',
  mono: '"SF Mono", Menlo, Consolas, "Courier New", "MS Gothic", "Osaka-Mono", monospace',
  pop: '"Mochiy Pop One", "Hiragino Maru Gothic ProN", "Yu Gothic UI", "Meiryo UI", sans-serif',
};

export type WatermarkOptions = {
  position: WatermarkPosition;
  /** 画像長辺に対するフォントサイズ比 (0.01 〜 0.05) */
  fontSizeRatio: number;
  /** 透明度 (0.1 〜 1.0) */
  opacity: number;
  color: WatermarkColor;
  fontFamily: WatermarkFontFamily;
  /** 縁取り (反対色のアウトライン)。視認性は上がるが主張が強くなる */
  stroke: boolean;
};

export const DEFAULT_WATERMARK: WatermarkOptions = {
  position: "bottom-right",
  fontSizeRatio: 0.02,
  opacity: 0.8,
  color: "auto",
  fontFamily: "sans",
  stroke: false,
};

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

/** EXIF / 透かしに埋め込むクレジット文字列のフォーマット種別 */
export type CreditFormat = "shot_by" | "photo_by" | "copyright" | "name_only";

/**
 * 各フォーマットの表示用ラベルと、senderName を受け取って実際の文字列を返すフォーマッタ。
 * UI のラベル/プレビュー表示と実際の埋め込み文字列の整合を一箇所で保つためにここに集約する。
 */
export const CREDIT_FORMATS: Record<
  CreditFormat,
  { label: string; preview: string; format: (name: string) => string }
> = {
  shot_by: { label: "撮影：〜", preview: "撮影：〜", format: (n) => `撮影：${n}` },
  photo_by: { label: "Photo by 〜", preview: "Photo by 〜", format: (n) => `Photo by ${n}` },
  copyright: { label: "© 〜", preview: "© 〜", format: (n) => `© ${n}` },
  name_only: { label: "名前のみ", preview: "〜", format: (n) => n },
};

export const DEFAULT_CREDIT_FORMAT: CreditFormat = "shot_by";

/**
 * EXIF/透かしに埋め込むクレジット文字列を生成する。
 * senderName が空の場合は空文字を返す。
 */
export function formatCredit(
  senderName: string,
  format: CreditFormat = DEFAULT_CREDIT_FORMAT,
): string {
  const trimmed = senderName.trim();
  if (!trimmed) return "";
  return CREDIT_FORMATS[format].format(trimmed);
}

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
  if (meta.type === "image/jpeg") return blob;

  if (isHeic(meta)) {
    // モダンブラウザ (Safari 17+, Chrome 120+) は HEIC をネイティブデコード可能。
    // まず createImageBitmap を試し、失敗時のみ heic-to にフォールバック。
    try {
      return await blobToJpegViaCanvas(blob);
    } catch {
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
 * Canvas 2D APIで透かしを描画した加工済みJPEGを返す。
 * 副産物として寸法も返す（サーバー側に送るため）
 */
export async function applyWatermark(
  jpegBlob: Blob,
  text: string,
  options: WatermarkOptions,
): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await decodeImage(jpegBlob);
  try {
    const width = img.width;
    const height = img.height;
    return await withCanvas(width, height, async (canvas) => {
      const ctx = getContext2d(canvas);
      // JPEG出力時に透過が黒になるのを防ぐ
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img.source, 0, 0);
      if (text) drawWatermark(ctx, width, height, text, options);
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

/** Canvas に直接透かしを描画する。プレビュー用に export */
export function drawWatermark(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  w: number,
  h: number,
  text: string,
  options: WatermarkOptions,
) {
  if (!text) return;
  const { position, fontSizeRatio, opacity, color, fontFamily, stroke } = options;
  const fontSize = Math.max(12, Math.round(Math.max(w, h) * fontSizeRatio));
  const pad = Math.round(fontSize * 0.6);

  ctx.save();
  ctx.font = `bold ${fontSize}px ${WATERMARK_FONT_STACKS[fontFamily]}`;
  ctx.textBaseline = "middle";

  const [vertical, horizontal] = position.split("-") as [
    "top" | "middle" | "bottom",
    "left" | "center" | "right",
  ];

  let x: number;
  switch (horizontal) {
    case "left":
      x = pad;
      ctx.textAlign = "left";
      break;
    case "center":
      x = w / 2;
      ctx.textAlign = "center";
      break;
    case "right":
      x = w - pad;
      ctx.textAlign = "right";
      break;
  }

  let y: number;
  switch (vertical) {
    case "top":
      y = pad + fontSize / 2;
      break;
    case "middle":
      y = h / 2;
      break;
    case "bottom":
      y = h - pad - fontSize / 2;
      break;
  }

  // "auto" は描画予定領域の平均輝度から色を決定
  let resolvedColor: "#ffffff" | "#000000";
  if (color === "auto") {
    const textWidth = ctx.measureText(text).width;
    const box = textBoundingBox(x, y, textWidth, fontSize, horizontal, w, h);
    resolvedColor = pickContrastColor(ctx, box);
  } else {
    resolvedColor = color;
  }

  ctx.globalAlpha = opacity;
  ctx.fillStyle = resolvedColor;
  if (stroke) {
    ctx.strokeStyle = resolvedColor === "#ffffff" ? "#000000" : "#ffffff";
    ctx.lineWidth = Math.max(1, fontSize * 0.08);
    ctx.lineJoin = "round";
    ctx.strokeText(text, x, y);
  }
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** テキストの描画予定領域を Canvas 座標系で算出 (画面外クランプ込み) */
function textBoundingBox(
  anchorX: number,
  anchorY: number,
  textWidth: number,
  fontSize: number,
  horizontal: "left" | "center" | "right",
  canvasW: number,
  canvasH: number,
): { x: number; y: number; w: number; h: number } {
  let rx: number;
  switch (horizontal) {
    case "left":
      rx = anchorX;
      break;
    case "center":
      rx = anchorX - textWidth / 2;
      break;
    case "right":
      rx = anchorX - textWidth;
      break;
  }
  const ry = anchorY - fontSize / 2;
  const x = Math.max(0, Math.floor(rx));
  const y = Math.max(0, Math.floor(ry));
  const w = Math.max(1, Math.min(Math.ceil(textWidth), canvasW - x));
  const h = Math.max(1, Math.min(Math.ceil(fontSize), canvasH - y));
  return { x, y, w, h };
}

/** 描画領域の平均輝度から視認性の高い色を選ぶ (Rec. 601) */
function pickContrastColor(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
): "#ffffff" | "#000000" {
  const data = ctx.getImageData(box.x, box.y, box.w, box.h).data;
  let total = 0;
  const pixels = box.w * box.h;
  for (let i = 0; i < data.length; i += 4) {
    total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const mean = total / pixels; // 0-255
  return mean < 128 ? "#ffffff" : "#000000";
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
