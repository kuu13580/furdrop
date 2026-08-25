// POST /download/zip (R08 一括ダウンロード)
import { env } from "cloudflare:test";
import piexif from "piexifjs";
import { describe, expect, it } from "vitest";
import { authHeader, createEmulatorUser } from "./helpers/auth";
import { apiFetch, apiJson } from "./helpers/fetch";
import { seedPhoto, seedSession, seedUser } from "./helpers/seed";
import { readZip } from "./helpers/zip";

/**
 * ブラウザのダウンロードは Authorization ヘッダを送れないので、この経路だけ
 * ID トークンをフォームのボディで受ける。ヘッダ認証の `/receiver/*` とは別扱い。
 */
async function postZip(fields: Record<string, string>): Promise<Response> {
  return apiFetch("/download/zip", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

async function zipBytes(res: Response): Promise<Uint8Array> {
  return new Uint8Array(await res.arrayBuffer());
}

/** R2 にダミーのオリジナルを置く (seedPhoto は D1 行だけ作る) */
async function putOriginal(key: string, bytes: Uint8Array): Promise<void> {
  await env.R2_ORIGINALS.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
}

/** SOI + APP0 + APP1(Model 入り) + SOS + EOI の最小 JPEG */
function jpegWithModel(model: string): Uint8Array {
  const payload = piexif.dump({ "0th": { [piexif.ImageIFD.Model]: model }, Exif: {}, GPS: {} });
  const exif = new Uint8Array(payload.length);
  for (let i = 0; i < payload.length; i++) exif[i] = payload.charCodeAt(i) & 0xff;
  const length = exif.length + 2;
  const parts = [
    new Uint8Array([0xff, 0xd8]),
    new Uint8Array([
      0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00,
      0x01, 0x00, 0x00,
    ]),
    new Uint8Array([0xff, 0xe1, (length >> 8) & 0xff, length & 0xff]),
    exif,
    new Uint8Array([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]),
    new Uint8Array([0xff, 0xd9]),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

describe("POST /download/zip", () => {
  it("選択した写真を ZIP で返し、命名規則と Content-Disposition が揃う", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "zip_ok" });
    const sessionId = await seedSession({ receiverId: uid });
    const a = await seedPhoto({ receiverId: uid, handle: "zip_ok", sessionId });
    const b = await seedPhoto({ receiverId: uid, handle: "zip_ok", sessionId });
    await putOriginal(a.r2KeyOriginal, new Uint8Array([1, 2, 3, 4, 5]));
    await putOriginal(b.r2KeyOriginal, new Uint8Array([6, 7, 8]));

    const res = await postZip({
      token: idToken,
      photo_ids: `${a.photoId},${b.photoId}`,
      exif_credit: "none",
      tz_offset_min: "540",
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(res.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="furdrop-zip_ok-\d{14}\.zip"$/,
    );
    // 進捗表示は MUST 要件ではないと決めたので chunked (Content-Length なし)
    expect(res.headers.get("Content-Length")).toBeNull();

    const entries = await readZip(await zipBytes(res));
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.filename).toMatch(/^\d{8}-\d{6}_\d{2}\.jpg$/);
    }
    // 同一セッション内の連番なので _01 と _02 になる
    expect(entries.map((e) => e.filename.slice(-7)).sort()).toEqual(["_01.jpg", "_02.jpg"]);
  });

  it("R2 に無い写真はスキップして MISSING.txt を同梱し、ZIP は正常に閉じる", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "zip_miss" });
    const ok = await seedPhoto({ receiverId: uid, handle: "zip_miss" });
    const gone = await seedPhoto({ receiverId: uid, handle: "zip_miss" });
    await putOriginal(ok.r2KeyOriginal, new Uint8Array([9, 9, 9]));
    // gone は R2 に置かない

    const res = await postZip({
      token: idToken,
      photo_ids: `${ok.photoId},${gone.photoId}`,
      exif_credit: "none",
    });

    expect(res.status).toBe(200);
    const entries = await readZip(await zipBytes(res));
    expect(entries).toHaveLength(2);
    const note = entries.find((e) => e.filename === "MISSING.txt");
    expect(note).toBeDefined();
    expect(new TextDecoder().decode(note?.data)).toContain("取得に失敗");
  });

  it("他人の写真 ID は ZIP に入らない", async () => {
    const owner = await createEmulatorUser();
    const other = await createEmulatorUser();
    await seedUser({ uid: owner.uid, handle: "zip_owner" });
    await seedUser({ uid: other.uid, handle: "zip_other" });
    const mine = await seedPhoto({ receiverId: owner.uid, handle: "zip_owner" });
    const theirs = await seedPhoto({ receiverId: other.uid, handle: "zip_other" });
    await putOriginal(mine.r2KeyOriginal, new Uint8Array([1]));
    await putOriginal(theirs.r2KeyOriginal, new Uint8Array([2]));

    const res = await postZip({
      token: owner.idToken,
      photo_ids: `${mine.photoId},${theirs.photoId}`,
      exif_credit: "none",
    });

    const entries = await readZip(await zipBytes(res));
    // 自分の 1 枚 + MISSING.txt (他人の ID は「見つからない」扱い)
    expect(entries.filter((e) => e.filename.endsWith(".jpg"))).toHaveLength(1);
  });

  it("exif_credit=artist なら Artist に送信者名を書き、Model は残す", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "zip_exif" });
    const jpeg = jpegWithModel("SONY ILCE-7M4");
    const photo = await seedPhoto({
      receiverId: uid,
      handle: "zip_exif",
      senderName: "@hanako_photo",
      fileSize: jpeg.length,
    });
    await putOriginal(photo.r2KeyOriginal, jpeg);

    const res = await postZip({
      token: idToken,
      photo_ids: photo.photoId,
      exif_credit: "artist",
    });

    const entries = await readZip(await zipBytes(res));
    expect(entries).toHaveLength(1);
    const ifd0 = readIfd0(entries[0].data);
    expect(ifd0[piexif.ImageIFD.Artist]).toBe("Photo by hanako_photo");
    expect(ifd0[piexif.ImageIFD.Model]).toBe("SONY ILCE-7M4");
  });

  it("合計サイズが上限を超えるとヘッダ送出前に 400 で拒否する", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "zip_big" });
    // 20MB (MAX_FILE_SIZE) × 200 枚 = 4GB > 3.5GB
    const ids: string[] = [];
    for (let i = 0; i < 200; i++) {
      const photo = await seedPhoto({
        receiverId: uid,
        handle: "zip_big",
        fileSize: 20 * 1024 * 1024,
      });
      ids.push(photo.photoId);
    }

    // フロントは dry_run で先に弾くので、判断に使う値は JSON で受け取れること
    const dry = await postZip({
      token: idToken,
      photo_ids: ids.join(","),
      exif_credit: "none",
      dry_run: "1",
    });
    expect(dry.status).toBe(400);
    const body = (await dry.json()) as {
      error: { code: string; selected_count: number; selected_bytes: number; limit_bytes: number };
    };
    expect(body.error.code).toBe("SELECTION_TOO_LARGE");
    expect(body.error.selected_count).toBe(200);
    expect(body.error.selected_bytes).toBeGreaterThan(body.error.limit_bytes);

    // dry_run を通り抜けた実 POST でも弾かれ、そのときは HTML で返る
    const real = await postZip({ token: idToken, photo_ids: ids.join(","), exif_credit: "none" });
    expect(real.status).toBe(400);
    expect(real.headers.get("Content-Type")).toMatch(/text\/html/);
  });

  it("トークンが不正なら 401、photo_ids が無ければ 400", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "zip_auth" });

    const badToken = await postZip({ token: "not-a-token", photo_ids: crypto.randomUUID() });
    expect(badToken.status).toBe(401);

    const noIds = await postZip({ token: idToken, photo_ids: "" });
    expect(noIds.status).toBe(400);
  });

  it("dry_run=1 は ZIP を作らず検証結果を JSON で返す", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "zip_dry" });
    const photo = await seedPhoto({ receiverId: uid, handle: "zip_dry", fileSize: 4096 });
    await putOriginal(photo.r2KeyOriginal, new Uint8Array(4096));

    const res = await postZip({
      token: idToken,
      photo_ids: photo.photoId,
      exif_credit: "none",
      dry_run: "1",
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
    const body = (await res.json()) as {
      ok: boolean;
      selected_count: number;
      selected_bytes: number;
      limit_bytes: number;
    };
    expect(body.ok).toBe(true);
    expect(body.selected_count).toBe(1);
    expect(body.selected_bytes).toBe(4096);
    expect(body.limit_bytes).toBeGreaterThan(0);
  });

  // 目的: ZIP 内のファイル名が単体 DL と一致すること。両者は連番の算出方法が違う
  // (相関サブクエリ vs JS のカウンタ) ので、片方だけ壊れても気づけるようにする
  it("ZIP のエントリ名が単体 DL の filename と一致する", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "zip_parity" });
    const sessionId = await seedSession({ receiverId: uid });
    const first = await seedPhoto({ receiverId: uid, handle: "zip_parity", sessionId });
    const second = await seedPhoto({ receiverId: uid, handle: "zip_parity", sessionId });
    await putOriginal(first.r2KeyOriginal, new Uint8Array([1]));
    await putOriginal(second.r2KeyOriginal, new Uint8Array([2]));

    const single = await Promise.all(
      [first, second].map(async (photo) => {
        const { body } = await apiJson<{ filename: string }>(
          `/receiver/photos/${photo.photoId}/download?tz_offset_min=540`,
          { headers: authHeader(idToken) },
        );
        return body.filename;
      }),
    );

    const res = await postZip({
      token: idToken,
      photo_ids: `${first.photoId},${second.photoId}`,
      exif_credit: "none",
      tz_offset_min: "540",
    });
    const entries = await readZip(await zipBytes(res));

    expect(entries.map((e) => e.filename).sort()).toEqual([...single].sort());
  });

  // 目的: tz_offset_min 省略時が UTC (0) に落ちないこと。Number(null) も Number("") も
  // 0 になるので、素朴に Number() を通すと単体 DL (default 540) と食い違う
  it("tz_offset_min を省略すると JST 基準のファイル名になる", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "zip_tz" });
    // UTC 2026-01-01 20:00 = JST 2026-01-02 05:00 (日付が変わる時刻)
    const createdAt = Math.floor(Date.UTC(2026, 0, 1, 20, 0, 0) / 1000);
    const photo = await seedPhoto({ receiverId: uid, handle: "zip_tz", createdAt });
    await putOriginal(photo.r2KeyOriginal, new Uint8Array([1]));

    const res = await postZip({ token: idToken, photo_ids: photo.photoId, exif_credit: "none" });
    const entries = await readZip(await zipBytes(res));

    expect(entries[0].filename).toBe("20260102-050000_01.jpg");
  });

  // 目的: 実 POST は <form target="_self"> のナビゲーションなので、エラーで JSON を返すと
  // SPA が生の JSON ページに置き換わる。HTML にして人が読めて戻れる形にしておく
  it("非 dry_run のエラーは JSON ではなく HTML で返す", async () => {
    const badToken = await postZip({ token: "not-a-token", photo_ids: crypto.randomUUID() });
    expect(badToken.status).toBe(401);
    expect(badToken.headers.get("Content-Type")).toMatch(/text\/html/);
    expect(await badToken.text()).toContain("history.back()");

    // dry_run なら JSON のまま (フロントがコードで分岐する)
    const dry = await postZip({
      token: "not-a-token",
      photo_ids: crypto.randomUUID(),
      dry_run: "1",
    });
    expect(dry.status).toBe(401);
    expect(dry.headers.get("Content-Type")).toMatch(/application\/json/);
  });
});

function readIfd0(jpeg: Uint8Array): Record<number, unknown> {
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < jpeg.length; i += CHUNK) {
    binary += String.fromCharCode(...jpeg.subarray(i, i + CHUNK));
  }
  return piexif.load(`data:image/jpeg;base64,${btoa(binary)}`)["0th"] as Record<number, unknown>;
}
