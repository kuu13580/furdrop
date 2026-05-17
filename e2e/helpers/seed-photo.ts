// Workers API + /dev/images/upload プロキシ経由で 1 枚送って confirm まで通す。
// 受信者ビュー (ギャラリー / 詳細) のテストに使う。
// 製品コードと同じ経路を踏むので、専用の DB injection は不要。

const WORKERS = "http://localhost:9000";
const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff]);

function buildJpegBuffer(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(JPEG_HEADER, 0);
  return bytes;
}

export async function seedOnePhotoFor(
  handle: string,
  sendKey: string,
  options: { fileSize?: number; thumbSize?: number; senderName?: string } = {},
): Promise<{ photoId: string }> {
  const fileSize = options.fileSize ?? 2048;
  const thumbSize = options.thumbSize ?? 256;

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
    body: buildJpegBuffer(fileSize) as unknown as BodyInit,
  });
  await fetch(`${WORKERS}${thumb_upload_url}`, {
    method: "PUT",
    body: buildJpegBuffer(thumbSize) as unknown as BodyInit,
  });

  const confirmRes = await fetch(
    `${WORKERS}/send/${handle}/sessions/${session_id}/photos/${photo_id}/confirm`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
  if (!confirmRes.ok) throw new Error(`confirm: ${confirmRes.status} ${await confirmRes.text()}`);

  return { photoId: photo_id };
}
