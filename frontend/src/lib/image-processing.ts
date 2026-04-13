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

export type WatermarkOptions = {
  text: string;
  position: WatermarkPosition;
  /** 画像長辺に対するフォントサイズ比 (0.01 〜 0.05) */
  fontSizeRatio: number;
  /** 透明度 (0.1 〜 1.0) */
  opacity: number;
  color: "#ffffff" | "#000000";
};

export const DEFAULT_WATERMARK: WatermarkOptions = {
  text: "",
  position: "bottom-right",
  fontSizeRatio: 0.02,
  opacity: 0.5,
  color: "#ffffff",
};

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

/** 入力がHEIC系か判定 (MIME / 拡張子) */
function isHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  return /\.hei[cf]$/i.test(file.name);
}

/** JPEG以外はJPEGに変換する。JPEGはそのまま返す */
export async function normalizeToJpeg(file: File): Promise<Blob> {
  if (file.type === "image/jpeg") return file;

  if (isHeic(file)) {
    // iOS等向け。重いのでdynamic import
    const { default: heic2any } = await import("heic2any");
    const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    return Array.isArray(result) ? result[0] : result;
  }

  // PNG等をCanvasでJPEGに変換
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = createCanvas(bitmap.width, bitmap.height);
    const ctx = getContext2d(canvas);
    ctx.drawImage(bitmap, 0, 0);
    return await canvasToBlob(canvas, "image/jpeg", 0.92);
  } finally {
    bitmap.close();
  }
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
 * Canvas 2D APIで透かしを描画した加工済みJPEGを返す。
 * 副産物として寸法も返す（サーバー側に送るため）
 */
export async function applyWatermark(
  jpegBlob: Blob,
  options: WatermarkOptions,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(jpegBlob, { imageOrientation: "from-image" });
  try {
    const width = bitmap.width;
    const height = bitmap.height;
    const canvas = createCanvas(width, height);
    const ctx = getContext2d(canvas);
    ctx.drawImage(bitmap, 0, 0);
    if (options.text) drawWatermark(ctx, width, height, options);
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
    return { blob, width, height };
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

// ========== internal helpers ==========

function drawWatermark(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  w: number,
  h: number,
  options: WatermarkOptions,
) {
  const { text, position, fontSizeRatio, opacity, color } = options;
  const fontSize = Math.max(12, Math.round(Math.max(w, h) * fontSizeRatio));
  const pad = Math.round(fontSize * 0.6);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = color;
  ctx.strokeStyle = color === "#ffffff" ? "#000000" : "#ffffff";
  ctx.lineWidth = Math.max(1, fontSize * 0.08);
  ctx.lineJoin = "round";
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

  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

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
