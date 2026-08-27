import { readFileSync } from "node:fs";

// Workers API + /dev/images/upload プロキシ経由で 1 枚送って confirm まで通す。
// 受信者ビュー (ギャラリー / 詳細) のテストに使う。
// 製品コードと同じ経路を踏むので、専用の DB injection は不要。

const WORKERS = "http://localhost:9000";
/**
 * SOI + APP0(JFIF) + SOS + パディング + EOI の最小 JPEG。
 * X10 のマジックバイト検証 (FF D8 FF) を通しつつ、DL 時の EXIF 差し替え (R17) が
 * セグメントを走査できる形にしておく (サーバー側は SOS まで届かないと差し替えを諦める)。
 */
function buildJpegBuffer(size: number): Uint8Array {
  const head = [
    0xff,
    0xd8, // SOI
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00, // APP0 (JFIF)
    0xff,
    0xda,
    0x00,
    0x08,
    0x01,
    0x01,
    0x00,
    0x00,
    0x3f,
    0x00, // SOS
  ];
  const bytes = new Uint8Array(Math.max(size, head.length + 2));
  bytes.set(head, 0);
  bytes.set([0xff, 0xd9], bytes.length - 2); // EOI
  return bytes;
}

export async function seedOnePhotoFor(
  handle: string,
  sendKey: string,
  options: {
    fileSize?: number;
    thumbSize?: number;
    senderName?: string;
    /**
     * 実在する JPEG を原寸で上げる (スクショ用)。既定のダミーはデコードできないので
     * ギャラリーが alt テキストだらけになる。指定時は fileSize / thumbSize を無視する。
     */
    imagePath?: string;
  } = {},
): Promise<{ photoId: string }> {
  const image = options.imagePath ? new Uint8Array(readFileSync(options.imagePath)) : null;
  const fileSize = image ? image.length : (options.fileSize ?? 2048);
  const thumbSize = image ? image.length : (options.thumbSize ?? 256);

  const sessRes = await fetch(`${WORKERS}/send/${handle}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: sendKey,
      sender_name: options.senderName ?? null,
      photo_count: 1,
    }),
  });
  if (!sessRes.ok) throw new Error(`session: ${sessRes.status} ${await sessRes.text()}`);
  const { session_id } = (await sessRes.json()) as { session_id: string };

  const phRes = await fetch(`${WORKERS}/send/${handle}/sessions/${session_id}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      photos: [{ filename: "seed.jpg", file_size: fileSize, thumb_size: thumbSize }],
    }),
  });
  if (!phRes.ok) throw new Error(`photos: ${phRes.status} ${await phRes.text()}`);
  const { uploads } = (await phRes.json()) as {
    uploads: { photo_id: string; upload_url: string; thumb_upload_url: string }[];
  };
  const { photo_id, upload_url, thumb_upload_url } = uploads[0];

  // Node 18+ の fetch は Uint8Array を直接受けるが、lib.dom の BodyInit と
  // Uint8Array<ArrayBufferLike> の generic がぶつかるので as でキャスト。
  await fetch(`${WORKERS}${upload_url}`, {
    method: "PUT",
    body: (image ?? buildJpegBuffer(fileSize)) as unknown as BodyInit,
  });
  await fetch(`${WORKERS}${thumb_upload_url}`, {
    method: "PUT",
    body: (image ?? buildJpegBuffer(thumbSize)) as unknown as BodyInit,
  });

  const confirmRes = await fetch(
    `${WORKERS}/send/${handle}/sessions/${session_id}/photos/${photo_id}/confirm`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
  if (!confirmRes.ok) throw new Error(`confirm: ${confirmRes.status} ${await confirmRes.text()}`);

  return { photoId: photo_id };
}
