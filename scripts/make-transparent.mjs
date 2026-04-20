/**
 * 白背景の画像(JPEG等)の白い部分を透過してPNGに変換するユーティリティ。
 *
 * 判定アルゴリズム:
 * 1. 彩度 >= SATURATION_MIN の色付きピクセルは無条件で不透明 (色相が残るように)
 * 2. 残ったピクセルは min(R,G,B) で白さを判定
 *    - THRESHOLD_HIGH 以上: 完全透明
 *    - THRESHOLD_LOW 以下: 完全不透明
 *    - 中間: 線形補間でアンチエイリアス
 *
 * 使い方:
 *   node scripts/make-transparent.mjs <input> <output> [--threshold-low=120] [--threshold-high=200] [--saturation-min=0.3]
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const flags = Object.fromEntries(
  args
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.slice(2).split("=");
      return [k, v];
    }),
);

if (positional.length < 2) {
  console.error(
    "Usage: node scripts/make-transparent.mjs <input> <output> [--threshold-low=210] [--threshold-high=240]",
  );
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = resolve(root, positional[0]);
const outputPath = resolve(root, positional[1]);
const thresholdLow = Number(flags["threshold-low"] ?? 120);
const thresholdHigh = Number(flags["threshold-high"] ?? 200);
const saturationMin = Number(flags["saturation-min"] ?? 0.3);

const { data, info } = await sharp(inputPath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height, channels } = info;
const pixels = width * height;
const output = Buffer.alloc(pixels * 4);

for (let i = 0; i < pixels; i++) {
  const r = data[i * channels];
  const g = data[i * channels + 1];
  const b = data[i * channels + 2];
  const origAlpha = channels === 4 ? data[i * channels + 3] : 255;
  const maxVal = Math.max(r, g, b);
  const minVal = Math.min(r, g, b);
  const saturation = maxVal > 0 ? (maxVal - minVal) / maxVal : 0;

  let alpha;
  if (saturation >= saturationMin) {
    // 彩度が高い (色が付いている) → コンテンツとして維持
    alpha = 255;
  } else if (minVal >= thresholdHigh) {
    alpha = 0;
  } else if (minVal <= thresholdLow) {
    alpha = 255;
  } else {
    alpha = Math.round((255 * (thresholdHigh - minVal)) / (thresholdHigh - thresholdLow));
  }

  output[i * 4] = r;
  output[i * 4 + 1] = g;
  output[i * 4 + 2] = b;
  output[i * 4 + 3] = Math.min(origAlpha, alpha);
}

await sharp(output, { raw: { width, height, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);

console.log(`Wrote ${outputPath} (${width}x${height})`);
