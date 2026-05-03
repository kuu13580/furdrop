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

export type WatermarkOptions = {
  position: WatermarkPosition;
  /** 画像長辺に対するフォントサイズ比 (0.01 〜 0.05) */
  fontSizeRatio: number;
  /** 透明度 (0.1 〜 1.0) */
  opacity: number;
  color: WatermarkColor;
  /** 縁取り (反対色のアウトライン)。視認性は上がるが主張が強くなる */
  stroke: boolean;
};

export const DEFAULT_WATERMARK: WatermarkOptions = {
  position: "bottom-right",
  fontSizeRatio: 0.02,
  opacity: 0.5,
  color: "auto",
  stroke: false,
};

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

/**
 * EXIF/透かしに埋め込む「撮影：〜」形式のクレジット文字列を生成する。
 * senderName が空の場合は空文字を返す。
 */
export function formatCredit(senderName: string): string {
  const trimmed = senderName.trim();
  return trimmed ? `撮影：${trimmed}` : "";
}

/** 入力がHEIC系か判定 (MIME / 拡張子) */
function isHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  return /\.hei[cf]$/i.test(file.name);
}

/** Blob を Canvas 経由で JPEG に変換する共通処理 */
async function blobToJpegViaCanvas(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  try {
    const canvas = createCanvas(bitmap.width, bitmap.height);
    const ctx = getContext2d(canvas);
    // JPEGはアルファを持てないため、透過部分を白埋め (デフォルト黒になるのを防ぐ)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0);
    return await canvasToBlob(canvas, "image/jpeg", 0.92);
  } finally {
    bitmap.close();
  }
}

/** JPEG以外はJPEGに変換する。JPEGはそのまま返す */
export async function normalizeToJpeg(file: File): Promise<Blob> {
  if (file.type === "image/jpeg") return file;

  if (isHeic(file)) {
    // モダンブラウザ (Safari 17+, Chrome 120+) は HEIC をネイティブデコード可能。
    // まず createImageBitmap を試し、失敗時のみ heic-to にフォールバック。
    try {
      return await blobToJpegViaCanvas(file);
    } catch {
      const { heicTo } = await import("heic-to");
      return await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
    }
  }

  // PNG等をCanvasでJPEGに変換
  return blobToJpegViaCanvas(file);
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
  exifObj["0th"][piexif.ImageIFD.Model] = senderText;
  const exifBytes = piexif.dump(exifObj);
  const newDataUrl = piexif.insert(exifBytes, dataUrl);
  return dataUrlToBlob(newDataUrl);
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
  const bitmap = await createImageBitmap(jpegBlob, { imageOrientation: "from-image" });
  try {
    const width = bitmap.width;
    const height = bitmap.height;
    const canvas = createCanvas(width, height);
    const ctx = getContext2d(canvas);
    // JPEG出力時に透過が黒になるのを防ぐ
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0);
    if (text) drawWatermark(ctx, width, height, text, options);
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}

/** JPEGの寸法を取得（再エンコードしないのでEXIFは維持される） */
export async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

/** 長辺400px, 品質0.7のサムネイルJPEGを生成 */
export async function generateThumbnail(jpegBlob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(jpegBlob, { imageOrientation: "from-image" });
  try {
    const maxSize = 400;
    const scale = Math.min(maxSize / bitmap.width, maxSize / bitmap.height, 1);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = createCanvas(w, h);
    const ctx = getContext2d(canvas);
    ctx.drawImage(bitmap, 0, 0, w, h);
    return await canvasToBlob(canvas, "image/jpeg", 0.7);
  } finally {
    bitmap.close();
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
  const { position, fontSizeRatio, opacity, color, stroke } = options;
  const fontSize = Math.max(12, Math.round(Math.max(w, h) * fontSizeRatio));
  const pad = Math.round(fontSize * 0.6);

  ctx.save();
  ctx.font = `bold ${fontSize}px sans-serif`;
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
