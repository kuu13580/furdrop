// 1x1 ピクセルの最小有効 JPEG / PNG を base64 で保持。
// テスト時に Buffer に展開して `setInputFiles({ name, mimeType, buffer })` に渡す。
// fixture ファイルを git に置く代わりにコード上で完結させ、レビューしやすくしている。

const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AH//Z";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export type FixtureFile = {
  name: string;
  mimeType: string;
  buffer: Buffer;
};

export function tinyJpeg(name = "sample.jpg"): FixtureFile {
  return {
    name,
    mimeType: "image/jpeg",
    buffer: Buffer.from(TINY_JPEG_BASE64, "base64"),
  };
}

/**
 * HEIC fixture を読む。リポジトリには含まれていないので、ファイルが無ければ null。
 * HEIC を試したい場合は `e2e/fixtures/sample.heic` を配置する (iPhone で撮った最小サイズの HEIC など)。
 * spec 側ではファイル不在時に test.skip() に切り替える。
 */
export function readHeicIfExists(): FixtureFile | null {
  try {
    const buffer = readFileSync(join(here, "sample.heic"));
    return { name: "sample.heic", mimeType: "image/heic", buffer };
  } catch {
    return null;
  }
}
