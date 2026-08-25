import { configure, ZipWriter } from "@zip.js/zip.js/lib/zip-core-native.js";
import {
  buildCreditText,
  EXIF_HEAD_MAX_BYTES,
  type ExifCreditMode,
  spliceExifCredit,
} from "./exif-credit";

/**
 * R08: 一括ダウンロードの ZIP を Workers で組み立てて 1 本のレスポンスとして流す。
 *
 * クライアントで ZIP を作ると Blob に全量が溜まり、iOS の WebKit は Blob を
 * ディスクへ退避できないため枚数の天井があった。サーバーから流せばブラウザの
 * ダウンロードマネージャがディスクへ逐次書きするので枚数に依存しなくなる。
 */

/**
 * zip.js の `add()` は module スコープのカウンタで同時実行数を `maxWorkers` に絞る。
 * workerd では navigator.hardwareConcurrency = 1 なので既定値が 1 になり、
 * **isolate 内で 2 本目の ZIP リクエストが永久に待たされて runtime に kill される**
 * (空の 200 が返る)。1 リクエストの中では逐次 add しかしないので、ゲート自体が不要。
 * useWebWorkers も workerd に Worker が無いので明示的に切る。
 */
configure({ maxWorkers: Number.MAX_SAFE_INTEGER, useWebWorkers: false });

export type ZipEntry = {
  name: string;
  readable: ReadableStream<Uint8Array>;
  /**
   * 展開後のバイト数。**必ず渡すこと。**
   * 省略すると zip.js はサイズ不明とみなし、4GB 未満でも全エントリを ZIP64 にする
   * (`lib/core/zip-writer.js` の `reader.size === UNDEFINED_VALUE` 分岐)。
   * ZIP64 + data descriptor は展開ツール側の対応がばらつくので避ける。
   */
  size?: number;
};

export type CreateZipStreamOptions = {
  /** ヘッダ送出後の失敗はストリームを切るしかない。観測のためのフック */
  onError?: (err: unknown) => void;
};

/**
 * `add` は内部で promise チェーンに繋いで**必ず直列化**する。
 *
 * zip.js の `add` を並列に呼ぶと `zip-writer.js` の bufferedWrite 分岐 (writerLocked 時) に
 * 入る。この分岐は `highWaterMark: INFINITY_VALUE` の TransformStream を作るので、
 * ランタイム次第で「エントリ丸ごとメモリに溜める」か「TypeError で無言にエントリが欠落する」
 * のどちらかになる (現在の workerd は後者)。呼び出し側の作法で守るのではなく構造で封じる。
 *
 * 同じ理由で **`add` に `dataDescriptor: false` を渡してはいけない**。サイズが既知なら
 * descriptor は不要に見えるが、`!dataDescriptor` も bufferedWrite の条件に入っている。
 */
export function createZipStream(
  produce: (add: (entry: ZipEntry) => Promise<void>) => Promise<void>,
  options: CreateZipStreamOptions = {},
): ReadableStream<Uint8Array> {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  // 写真は既圧縮 JPEG なので level: 0 (store) で二重圧縮を避ける
  const zipWriter = new ZipWriter(writable, { level: 0 });

  let chain: Promise<void> = Promise.resolve();
  let failure: unknown = null;
  const add = (entry: ZipEntry): Promise<void> => {
    const next = chain.then(async () => {
      await zipWriter.add(
        entry.name,
        entry.size === undefined ? entry.readable : { readable: entry.readable, size: entry.size },
      );
    });
    // 保管する側は必ず handled にしておく。呼び出し側が await を忘れても
    // unhandled rejection にならず、失敗は produce のあとで throw し直される
    chain = next.catch((err) => {
      failure ??= err;
    });
    return next;
  };

  (async () => {
    try {
      await produce(add);
      // produce が add を await し忘れていても取りこぼさない
      await chain;
      if (failure !== null) throw failure;
      await zipWriter.close();
    } catch (err) {
      options.onError?.(err);
      // 200 と Content-Disposition を返した後なのでエラーには切り替えられない。
      // ストリームを切って「壊れた ZIP」としてクライアントに見せる
      await writable.abort(err).catch(() => undefined);
    }
  })();

  return readable;
}

/**
 * R17: JPEG の APP1 を差し替えて送信者名を EXIF に書き込む。
 *
 * 先頭だけをバッファして差し替え、残りはパススルーする。差し替え後のサイズが
 * ここで確定するので ZIP エントリに正確な size を宣言できる (ZipEntry.size 参照)。
 * 差し替えに失敗した場合は無加工のまま返す (DL 自体は成立させる)。
 */
export async function applyExifCredit(
  body: ReadableStream<Uint8Array>,
  size: number,
  senderName: string | null | undefined,
  mode: ExifCreditMode,
): Promise<{ readable: ReadableStream<Uint8Array>; size: number; credited: boolean }> {
  if (mode === "none" || !buildCreditText(senderName)) {
    return { readable: body, size, credited: false };
  }

  const reader = body.getReader();
  const headTarget = Math.min(size, EXIF_HEAD_MAX_BYTES);
  const chunks: Uint8Array[] = [];
  let headLength = 0;
  while (headLength < headTarget) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    headLength += value.length;
  }

  const head = concat(chunks, headLength);
  const spliced = safeSplice(head, senderName, mode);
  const newHead = spliced ?? head;

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(newHead);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  return {
    readable,
    size: size - head.length + newHead.length,
    credited: spliced !== null,
  };
}

function safeSplice(
  head: Uint8Array,
  senderName: string | null | undefined,
  mode: ExifCreditMode,
): Uint8Array | null {
  try {
    return spliceExifCredit(head, senderName, mode);
  } catch {
    return null;
  }
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
