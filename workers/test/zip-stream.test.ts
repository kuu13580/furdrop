import piexif from "piexifjs";
import { describe, expect, it } from "vitest";
import { EXIF_HEAD_MAX_BYTES } from "../src/lib/exif-credit";
import { applyExifCredit, createZipStream } from "../src/lib/zip-stream";
import { hasZip64ExtraField, readZip, versionNeededToExtract } from "./helpers/zip";

/**
 * サーバー側 ZIP ストリーム (R08) の検証。
 *
 * ここで押さえたいのは 2 点:
 * 1. zip.js が workerd で動き、読み戻せる ZIP を吐くこと
 * 2. エントリに size を渡さないと **4GB 未満でも全エントリが ZIP64 になる** こと
 *    (`zip-writer.js` の `reader.size === UNDEFINED_VALUE` 分岐)。ZIP64 + data descriptor は
 *    展開ツール側の対応がばらつくので、必ず size を渡す実装にする
 */

describe("createZipStream", () => {
  it("size を渡すと ZIP64 にならず、展開すると元のバイト列に戻る", async () => {
    const a = pattern(3000, 1);
    const b = pattern(5000, 2);

    const zip = await collect(
      createZipStream(async (add) => {
        await add({ name: "a.bin", readable: streamOf(a), size: a.length });
        await add({ name: "b.bin", readable: streamOf(b), size: b.length });
      }),
    );

    expect(versionNeededToExtract(zip)).toBe(20);
    expect(hasZip64ExtraField(zip)).toBe(false);

    const entries = await readZip(zip);
    expect(entries.map((e) => e.filename)).toEqual(["a.bin", "b.bin"]);
    expect(entries[0].data).toEqual(a);
    expect(entries[1].data).toEqual(b);
  });

  it("size を省略すると小さいエントリでも ZIP64 になる (だから省略しない)", async () => {
    const a = pattern(1000, 7);

    const zip = await collect(
      createZipStream(async (add) => {
        await add({ name: "a.bin", readable: streamOf(a) });
      }),
    );

    expect(versionNeededToExtract(zip)).toBe(45);
    expect(hasZip64ExtraField(zip)).toBe(true);

    // ZIP64 でも zip.js 自身は読み戻せる (壊れているわけではない)
    const entries = await readZip(zip);
    expect(entries[0].data).toEqual(a);
  });

  it("同一 isolate で 2 本を同時に流しても両方完走する (zip.js の module スコープのゲート対策)", async () => {
    // zip.js の add は module スコープの workers カウンタで同時実行数を maxWorkers に絞る。
    // workerd は navigator.hardwareConcurrency = 1 なので既定では 2 本目が永久に待たされ、
    // ランタイムに「ハングした」と判定されて空の 200 が返る。configure で外したことの回帰テスト
    const a = pattern(2048, 1);
    const b = pattern(4096, 2);

    const build = (name: string, bytes: Uint8Array) =>
      collect(
        createZipStream(async (add) => {
          await add({ name, readable: streamOf(bytes, 512), size: bytes.length });
        }),
      );

    const [zipA, zipB] = await Promise.all([build("a.bin", a), build("b.bin", b)]);

    expect((await readZip(zipA))[0].data).toEqual(a);
    expect((await readZip(zipB))[0].data).toEqual(b);
  });

  it("R2 の get 失敗はスキップして MISSING.txt を同梱し、ZIP は正常に閉じる", async () => {
    // 実機検証 (⑥) で、ヘッダ送出後に中断した ZIP はブラウザが「DL 完了」として保存し
    // ユーザーに失敗が見えないことが判明した。get の失敗はバイトを 1 つも書く前に分かるので、
    // 中断せずスキップに落とせる
    const sources = [pattern(1024, 1), null, pattern(2048, 3)];
    const missing: string[] = [];

    const zip = await collect(
      createZipStream(async (add) => {
        for (const [i, bytes] of sources.entries()) {
          const name = `${i + 1}.bin`;
          try {
            if (bytes === null) throw new Error("r2 get failed");
            await add({ name, readable: streamOf(bytes, 256), size: bytes.length });
          } catch (err) {
            missing.push(`${name}: ${String(err)}`);
          }
        }
        const note = new TextEncoder().encode(missing.join("\n"));
        await add({ name: "MISSING.txt", readable: streamOf(note), size: note.length });
      }),
    );

    const entries = await readZip(zip);
    expect(entries.map((e) => e.filename)).toEqual(["1.bin", "3.bin", "MISSING.txt"]);
    expect(entries[0].data).toEqual(sources[0]);
    expect(new TextDecoder().decode(entries[2].data)).toContain("2.bin: Error: r2 get failed");
    expect(versionNeededToExtract(zip)).toBe(20);
  });

  it("produce が throw するとストリームがエラーで終わる (ヘッダ送出後は切るしかない)", async () => {
    let observed: unknown = null;

    const stream = createZipStream(
      async (add) => {
        const a = pattern(100, 1);
        await add({ name: "a.bin", readable: streamOf(a), size: a.length });
        throw new Error("r2 get failed");
      },
      { onError: (err) => (observed = err) },
    );

    await expect(collect(stream)).rejects.toThrow("r2 get failed");
    expect((observed as Error).message).toBe("r2 get failed");
  });
});

describe("applyExifCredit", () => {
  it("Artist を書き込み、宣言サイズが実バイト数と一致する", async () => {
    const jpeg = jpegWithExif("SONY ILCE-7M4");

    const out = await applyExifCredit(streamOf(jpeg), jpeg.length, "@hanako_photo", "artist");
    const bytes = await collect(out.readable);

    expect(out.credited).toBe(true);
    // ZIP エントリに宣言する size がずれると ZIP が壊れるので厳密に一致させる
    expect(out.size).toBe(bytes.length);

    const ifd0 = readIfd0(bytes);
    expect(ifd0[piexif.ImageIFD.Artist]).toBe("Photo by hanako_photo");
    // artist モードは元のカメラ機種名を残す
    expect(ifd0[piexif.ImageIFD.Model]).toBe("SONY ILCE-7M4");
  });

  it("artist_model は Model も上書きする", async () => {
    const jpeg = jpegWithExif("SONY ILCE-7M4");

    const out = await applyExifCredit(streamOf(jpeg), jpeg.length, "hanako", "artist_model");
    const ifd0 = readIfd0(await collect(out.readable));

    expect(ifd0[piexif.ImageIFD.Model]).toBe("Photo by hanako");
  });

  it("EXIF セグメントが無い JPEG にも APP1 を挿入する", async () => {
    const jpeg = jpegWithExif(null);

    const out = await applyExifCredit(streamOf(jpeg), jpeg.length, "hanako", "artist");
    const bytes = await collect(out.readable);

    expect(out.size).toBe(bytes.length);
    expect(readIfd0(bytes)[piexif.ImageIFD.Artist]).toBe("Photo by hanako");
  });

  it("none / 匿名は無加工でそのまま流す", async () => {
    const jpeg = jpegWithExif("SONY ILCE-7M4");

    for (const args of [["@hanako", "none"] as const, [null, "artist"] as const]) {
      const out = await applyExifCredit(streamOf(jpeg), jpeg.length, args[0], args[1]);
      expect(out.credited).toBe(false);
      expect(out.size).toBe(jpeg.length);
      expect(await collect(out.readable)).toEqual(jpeg);
    }
  });

  it("EXIF が head 内にあれば SOS が head 外でも差し替えられる (置換範囲より後ろは無変更)", async () => {
    // APP2 (ICC 等) を積んで SOS を EXIF_HEAD_MAX_BYTES より後ろへ押し出す
    const jpeg = jpegWithExif("SONY ILCE-7M4", EXIF_HEAD_MAX_BYTES + 4096);

    const out = await applyExifCredit(streamOf(jpeg), jpeg.length, "hanako", "artist");
    const bytes = await collect(out.readable);

    expect(out.credited).toBe(true);
    expect(out.size).toBe(bytes.length);
    expect(readIfd0(bytes)[piexif.ImageIFD.Artist]).toBe("Photo by hanako");
    // 末尾 (SOS 以降) がそのまま流れていること
    expect(bytes.subarray(bytes.length - 64)).toEqual(jpeg.subarray(jpeg.length - 64));
  });

  it("EXIF が無く SOS も head 外なら挿入位置が決まらないので無加工で流す", async () => {
    const jpeg = jpegWithExif(null, EXIF_HEAD_MAX_BYTES + 4096);

    const out = await applyExifCredit(streamOf(jpeg), jpeg.length, "hanako", "artist");
    const bytes = await collect(out.readable);

    expect(out.credited).toBe(false);
    expect(out.size).toBe(jpeg.length);
    expect(bytes).toEqual(jpeg);
  });

  it("piexif が読めない EXIF は無加工で流す (Orientation 等を消さない)", async () => {
    const jpeg = jpegWithExif("SONY ILCE-7M4");
    const broken = jpeg.slice();
    const app1 = broken.indexOf(0xe1, 2);
    broken.fill(0x00, app1 + 10, app1 + 40);

    const out = await applyExifCredit(streamOf(broken), broken.length, "hanako", "artist");

    expect(out.credited).toBe(false);
    expect(await collect(out.readable)).toEqual(broken);
  });

  it("日本語の送信者名も UTF-8 バイト列として書ける", async () => {
    const jpeg = jpegWithExif(null);

    const out = await applyExifCredit(streamOf(jpeg), jpeg.length, "はなこ", "artist");
    const bytes = await collect(out.readable);

    expect(out.size).toBe(bytes.length);
    // piexif は 1 文字 = 1 バイトで書くので、読み戻すと UTF-8 バイトの Latin1 表現になる
    const artist = readIfd0(bytes)[piexif.ImageIFD.Artist] as string;
    expect(new TextDecoder().decode(binaryToBytes(artist))).toBe("Photo by はなこ");
  });

  it("本番形状 (head より大きい JPEG) で末尾をパススルーしつつ IFD0 を独立に読める", async () => {
    const jpeg = jpegWithExif("SONY ILCE-7M4", 0, EXIF_HEAD_MAX_BYTES * 2);

    const out = await applyExifCredit(streamOf(jpeg, 64 * 1024), jpeg.length, "hanako", "artist");
    const bytes = await collect(out.readable);

    expect(out.size).toBe(bytes.length);
    expect(bytes.length).toBeGreaterThan(EXIF_HEAD_MAX_BYTES);
    // piexif で書いたものを piexif で読み戻すと自己整合の確認にしかならないので、
    // TIFF ヘッダから IFD0 を自分で辿って Artist を読む
    expect(readArtistByHand(bytes)).toBe("Photo by hanako");
    expect(bytes.subarray(bytes.length - 1024)).toEqual(jpeg.subarray(jpeg.length - 1024));
  });

  it("差し替え後に body が切れたら出力ストリームもエラーになる", async () => {
    const jpeg = jpegWithExif("SONY ILCE-7M4");
    let pulls = 0;
    const flaky = new ReadableStream<Uint8Array>({
      pull(controller) {
        // head 分を渡したあとで切る (R2 のストリームが途中で死ぬケース)
        if (pulls++ === 0) controller.enqueue(jpeg.slice());
        else controller.error(new Error("r2 stream broke"));
      },
    });

    // 宣言サイズを head 分ぴったりにして、先頭バッファ後 (= パススルー中) に切れる形にする
    const out = await applyExifCredit(flaky, jpeg.length, "hanako", "artist");

    await expect(collect(out.readable)).rejects.toThrow("r2 stream broke");
  });

  it("出力ストリームを cancel すると元の body も cancel される", async () => {
    const jpeg = jpegWithExif("SONY ILCE-7M4");
    let cancelled: unknown = null;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(jpeg.slice());
      },
      pull(controller) {
        controller.enqueue(new Uint8Array(1024));
      },
      cancel(reason) {
        cancelled = reason;
      },
    });

    const out = await applyExifCredit(source, jpeg.length * 4, "hanako", "artist");
    const reader = out.readable.getReader();
    await reader.read();
    await reader.cancel("client gone");

    expect(cancelled).toBe("client gone");
  });

  it("差し替えた JPEG を ZIP に入れても宣言サイズと整合する", async () => {
    const jpeg = jpegWithExif("SONY ILCE-7M4");
    const credited = await applyExifCredit(streamOf(jpeg), jpeg.length, "hanako", "artist");

    const zip = await collect(
      createZipStream(async (add) => {
        await add({ name: "photo.jpg", readable: credited.readable, size: credited.size });
      }),
    );

    expect(versionNeededToExtract(zip)).toBe(20);
    const entries = await readZip(zip);
    expect(entries[0].data.length).toBe(credited.size);
    expect(readIfd0(entries[0].data)[piexif.ImageIFD.Artist]).toBe("Photo by hanako");
  });
});

// ========== helpers ==========

function pattern(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = (i * 31 + seed) & 0xff;
  return out;
}

/** R2 の body を模して細かいチャンクに割って流す */
function streamOf(bytes: Uint8Array, chunkSize = 4096): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

async function collect(readable: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * SOI + APP0(JFIF) + [APP1(EXIF)] + [APP2 パディング] + SOS + EOI の最小 JPEG。
 * padTo を指定すると APP2 を積んで SOS の位置を後ろへ押し出す。
 */
function jpegWithExif(model: string | null, padTo = 0, scanBytes = 0): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
  parts.push(
    new Uint8Array([
      0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00,
      0x01, 0x00, 0x00,
    ]),
  );
  if (model !== null) {
    const payload = binaryToBytes(
      piexif.dump({ "0th": { [piexif.ImageIFD.Model]: model }, Exif: {}, GPS: {} }),
    );
    const length = payload.length + 2;
    const app1 = new Uint8Array(payload.length + 4);
    app1.set([0xff, 0xe1, (length >> 8) & 0xff, length & 0xff], 0);
    app1.set(payload, 4);
    parts.push(app1);
  }
  let size = parts.reduce((n, p) => n + p.length, 0);
  while (size < padTo) {
    const body = Math.min(0xfffb, padTo - size);
    // セグメント全体は marker(2) + length フィールドが表す (body + 2) バイト
    const app2 = new Uint8Array(body + 4);
    const length = body + 2;
    app2.set([0xff, 0xe2, (length >> 8) & 0xff, length & 0xff], 0);
    parts.push(app2);
    size += app2.length;
  }
  // piexif の splitIntoSegments は SOS (FFDA) が無いと走査を終えられないので必ず入れる
  parts.push(new Uint8Array([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]));
  // SOS 以降のスキャンデータ。0xFF を含めないので piexif の走査を乱さない
  if (scanBytes > 0) parts.push(new Uint8Array(scanBytes).fill(0x5a));
  parts.push(new Uint8Array([0xff, 0xd9]));

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function readIfd0(jpeg: Uint8Array): Record<number, unknown> {
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < jpeg.length; i += CHUNK) {
    binary += String.fromCharCode(...jpeg.subarray(i, i + CHUNK));
  }
  return piexif.load(`data:image/jpeg;base64,${btoa(binary)}`)["0th"] as Record<number, unknown>;
}

function binaryToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 0xff;
  return bytes;
}

/**
 * APP1 の TIFF ヘッダから IFD0 を自分で辿って Artist (0x013b) を読む。
 * piexif で書いたものを piexif で読み戻すと自己整合の確認にしかならないため。
 */
function readArtistByHand(jpeg: Uint8Array): string | null {
  let i = 2;
  while (i + 3 < jpeg.length) {
    if (jpeg[i] !== 0xff) return null;
    const marker = jpeg[i + 1];
    if (marker === 0xda || marker === 0xd9) return null;
    const length = (jpeg[i + 2] << 8) | jpeg[i + 3];
    if (marker === 0xe1) {
      const tiff = i + 4 + 6; // FFE1 + length + "Exif\0\0"
      const view = new DataView(jpeg.buffer, jpeg.byteOffset + tiff, jpeg.length - tiff);
      const little = view.getUint16(0, false) === 0x4949;
      const ifd0 = view.getUint32(4, little);
      const count = view.getUint16(ifd0, little);
      for (let e = 0; e < count; e++) {
        const entry = ifd0 + 2 + e * 12;
        if (view.getUint16(entry, little) !== 0x013b) continue;
        const size = view.getUint32(entry + 4, little);
        const offset = size > 4 ? view.getUint32(entry + 8, little) : entry + 8;
        const bytes = new Uint8Array(jpeg.buffer, jpeg.byteOffset + tiff + offset, size);
        return new TextDecoder().decode(bytes).replace(/\0+$/, "");
      }
      return null;
    }
    i += 2 + length;
  }
  return null;
}
