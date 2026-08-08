import { msg } from "@lingui/core/macro";
import { BlobReader, BlobWriter, ZipWriter } from "@zip.js/zip.js";
import { receiverApi } from "./api";
import { runConcurrent } from "./concurrency";
import { i18n } from "./i18n";

const FETCH_CONCURRENCY = 4;

export type ZipProgress = { processed: number; total: number; failed: number };

export type DownloadAsZipArgs = {
  photoIds: string[];
  zipName: string;
  onProgress: (progress: ZipProgress) => void;
  signal: AbortSignal;
};

/**
 * 選択した写真をクライアントサイドで ZIP に固めて a.download で発火する。
 *
 * - Presigned URL 取得 → fetch → ZipWriter.add を写真ごとに並列実行 (限界 FETCH_CONCURRENCY)。
 *   ZipWriter は内部で add を直列化するので、Blob は add 投入後すぐ手放せる
 * - 個別失敗 (URL 発行失敗 / fetch 失敗) は許容して成功分のみ ZIP に含める
 * - signal.aborted で中断
 */
export async function downloadAsZip(args: DownloadAsZipArgs): Promise<void> {
  const { photoIds, zipName, onProgress, signal } = args;
  const total = photoIds.length;
  let processed = 0;
  let failed = 0;

  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  const blobWriter = new BlobWriter("application/zip");
  // 写真は既圧縮 JPEG なので level: 0 (store) で二重圧縮を避ける
  const zipWriter = new ZipWriter(blobWriter, { level: 0 });
  const usedNames = new Set<string>();

  const tick = (didFail: boolean) => {
    processed++;
    if (didFail) failed++;
    onProgress({ processed, total, failed });
  };

  try {
    const results = await runConcurrent(photoIds, FETCH_CONCURRENCY, async (id) => {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      let url: string;
      let filename: string | null;
      try {
        const res = await receiverApi.downloadPhoto(id);
        url = res.download_url;
        filename = res.filename;
      } catch (err) {
        tick(true);
        throw err;
      }

      let blob: Blob;
      try {
        const fetched = await fetch(url, { signal });
        if (!fetched.ok) throw new Error(`fetch failed: ${fetched.status}`);
        blob = await fetched.blob();
      } catch (err) {
        if (signal.aborted) throw err;
        tick(true);
        throw err;
      }

      const entryName = uniqueName(filename ?? `${id}.jpg`, usedNames);
      try {
        await zipWriter.add(entryName, new BlobReader(blob), { signal });
      } catch (err) {
        if (signal.aborted) throw err;
        tick(true);
        throw err;
      }

      tick(false);
    });

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const allFailed = results.every((r) => r.status === "rejected");
    if (allFailed) {
      throw new Error(i18n._(msg`全ての写真のダウンロードに失敗しました`));
    }
  } catch (err) {
    // 中断・致命エラー時は ZIP を破棄
    await zipWriter.close().catch(() => undefined);
    throw err;
  }

  const zipBlob = await zipWriter.close();
  triggerBlobDownload(zipBlob, zipName);
}

function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 2;
  while (used.has(`${stem}_${i}${ext}`)) i++;
  const next = `${stem}_${i}${ext}`;
  used.add(next);
  return next;
}

function triggerBlobDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildZipName(handle: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `furdrop-${handle}-${stamp}.zip`;
}
