import { Hono } from "hono";
import { isExifCreditMode } from "../lib/exif-credit";
import { verifyFirebaseToken } from "../lib/firebase-auth";
import { logError } from "../lib/logger";
import { applyExifCredit, createZipStream } from "../lib/zip-stream";
import type { Env } from "../types";

/**
 * R08: 一括ダウンロード。選択した写真を Workers で ZIP に固めて 1 本のレスポンスで流す。
 *
 * **なぜ `/receiver/*` ではなく専用の経路なのか**: ブラウザのダウンロードは
 * `Authorization` ヘッダを送れない (API は別オリジンなので Cookie も third-party 扱いで
 * Safari の ITP に潰される)。そのため受信者フロントは隠しフォームの POST で
 * ID トークンと写真 ID を**ボディ**に載せて送る。ヘッダ前提の `requireAuth` は使えないので
 * このファイルだけボディからトークンを検証する。
 *
 * ボディのトークン自体が CSRF トークンの役割を果たす (Cookie 等の ambient authority を
 * 一切使わないので、クロスオリジンの POST を受けても攻撃者は何もできない)。
 */

/**
 * 1 リクエストで ZIP にできる合計バイト数。
 *
 * 実測 (deployed worker, `[limits] cpu_ms = 120000`) で上限は約 4.6GB。
 * CRC32 が約 27 CPU-ms/MiB で、超えるとストリームの途中で kill される。
 * **途中で切れた ZIP はブラウザが「DL 完了」として保存してしまい、ユーザーに失敗が
 * 見えない**ので、実測値に約 24% の余裕を残してここで弾く。
 */
const MAX_ZIP_BYTES = 3.5 * 1024 * 1024 * 1024;

/** tz_offset_min 省略時。i18n 対応前の挙動との後方互換で JST */
const DEFAULT_TZ_OFFSET_MIN = 540;

const download = new Hono<{ Bindings: Env }>();

/**
 * `dry_run=1` のときは ZIP を作らず検証結果だけを JSON で返す。
 *
 * 本番の発火は `<form target="_self">` の POST で、これは通常のナビゲーションなので
 * **サーバーがエラーを返すとその中身がページとして描画されてしまう**。そこでフロントは
 * 先に `fetch` で dry-run を打ち、200 が返ってからフォームを submit する。
 * それでも塞げない隙間 (レート制限・dry-run 後の写真削除) があるので、
 * **非 dry-run のエラーは JSON ではなく最小の HTML で返す** (`errorResponse` 参照)。
 */
download.post("/zip", async (c) => {
  const form = await c.req.formData();
  const dryRun = form.get("dry_run") === "1";
  const fail = (status: ErrorStatus, code: string, message: string, extra?: Extra) =>
    errorResponse(dryRun, status, code, message, extra);

  let uid: string;
  try {
    uid = (await verifyFirebaseToken(String(form.get("token") ?? ""), c.env)).sub;
  } catch {
    return fail(401, "UNAUTHORIZED", "ログインの有効期限が切れました。");
  }

  // レート制限は**実 POST だけ**に効かせる。dry-run でも消費すると「dry-run は通ったのに
  // 実 POST が 429」というズレが生まれ、_self のナビゲーションでエラーページに飛ばされる
  if (!dryRun) {
    const { success } = await c.env.RATE_LIMITER_ZIP.limit({ key: uid });
    if (!success) {
      return fail(
        429,
        "RATE_LIMITED",
        "ダウンロードの回数が多すぎます。1分ほど時間をおいてからお試しください。",
      );
    }
  }

  const requested = parseIds(String(form.get("photo_ids") ?? ""));
  if (requested.length === 0) {
    return fail(400, "INVALID_REQUEST", "写真が選択されていません。");
  }

  const exifCreditRaw = String(form.get("exif_credit") ?? "none");
  const exifCredit = isExifCreditMode(exifCreditRaw) ? exifCreditRaw : "none";
  const tzOffsetMin = parseTzOffset(form.get("tz_offset_min"));

  // D1 の bind パラメータは 1 クエリ 100 個までなので IN (...) で列挙できない。
  // 受信者の completed 写真を全件引いて JS で絞る。session_index (同一セッション内の
  // 連番) の算出にも同一セッションの全行が必要なので、結果的にこれが自然な形になる。
  const [photoRows, userRows] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT id, r2_key_original, file_size, sender_name, session_id, created_at
         FROM photos
        WHERE receiver_id = ? AND upload_status = 'completed'
        ORDER BY created_at ASC, id ASC`,
    ).bind(uid),
    c.env.DB.prepare("SELECT handle FROM users WHERE id = ?").bind(uid),
  ]);

  const handle = (userRows.results[0] as { handle?: string } | undefined)?.handle;
  if (!handle) {
    return fail(404, "NOT_FOUND", "アカウントが見つかりません。");
  }

  // owned は created_at ASC 順なので、ZIP のエントリも時系列順で決定的になる
  // (クライアントの選択順に依存させると、同名衝突時の `_2` が DL ごとに変わる)
  const owned = indexPhotos(photoRows.results as PhotoRow[], tzOffsetMin);
  const requestedSet = new Set(requested);
  const selected = [...owned.values()].filter((photo) => requestedSet.has(photo.id));
  const notFoundCount = requested.length - selected.length;

  if (selected.length === 0) {
    return fail(
      404,
      "NOT_FOUND",
      "選択した写真は見つかりませんでした。すでに削除されている可能性があります。",
    );
  }

  const totalBytes = selected.reduce((sum, photo) => sum + photo.fileSize, 0);
  if (totalBytes > MAX_ZIP_BYTES) {
    // ヘッダを送る前でないと弾けない (送出後はストリームを切るしかない)
    return fail(400, "SELECTION_TOO_LARGE", "選択した写真が大きすぎます。", {
      limit_bytes: MAX_ZIP_BYTES,
      selected_bytes: totalBytes,
      selected_count: selected.length,
    });
  }

  if (dryRun) {
    return Response.json({
      ok: true,
      selected_count: selected.length,
      selected_bytes: totalBytes,
      limit_bytes: MAX_ZIP_BYTES,
    });
  }

  const used = new Set<string>();
  const failed: string[] = [];
  const body = createZipStream(
    async (add) => {
      for (const photo of selected) {
        // クライアントが DL をやめたら残りの R2 get を続けない
        if (c.req.raw.signal.aborted) return;
        try {
          const object = await c.env.R2_ORIGINALS.get(photo.r2Key);
          if (!object) throw new Error("object not found");
          // R2 の get が失敗する場合はまだ 1 バイトも書いていないのでスキップできる。
          // body が転送途中で死んだ場合だけは取り消せず ZIP が壊れる (確率は低いと判断)
          const credited = await applyExifCredit(
            object.body,
            object.size,
            photo.senderName,
            exifCredit,
          );
          await add({
            name: uniqueName(photo.filename, used),
            readable: credited.readable,
            size: credited.size,
          });
        } catch (err) {
          failed.push(photo.filename);
          logError("zip-entry", err, { photoId: photo.id });
        }
      }

      if (failed.length > 0 || notFoundCount > 0) {
        const note = new TextEncoder().encode(missingNote(failed, notFoundCount));
        await add({ name: "MISSING.txt", readable: bytesStream(note), size: note.length });
      }
    },
    { onError: (err) => logError("zip-stream", err, { uid, count: selected.length }) },
  );

  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName(handle, tzOffsetMin)}"`,
      "Cache-Control": "no-store",
    },
  });
});

export default download;

// ========== internal ==========

type ErrorStatus = 400 | 401 | 404 | 429;
type Extra = Record<string, number>;

/**
 * dry-run なら JSON、実 POST なら**HTML** を返す。
 *
 * 実 POST は `<form target="_self">` のナビゲーションなので、JSON を返すと SPA が
 * 生の JSON ページに置き換わってしまう。HTML にしておけば少なくとも人が読めて
 * 戻れる。dry-run で先に弾くのが本筋で、ここはその取りこぼし用の受け皿。
 */
function errorResponse(
  dryRun: boolean,
  status: ErrorStatus,
  code: string,
  message: string,
  extra?: Extra,
): Response {
  if (dryRun) {
    return Response.json({ error: { code, message, ...extra } }, { status });
  }
  const body = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FurDrop</title>
<style>
  body { font: 16px/1.7 system-ui, sans-serif; margin: 0; padding: 2rem 1.25rem; max-width: 32rem; }
  a { color: #b4531f; }
</style>
<p>${escapeHtml(message)}</p>
<p><a href="#" onclick="history.back();return false">前のページに戻る / Go back</a></p>`;
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch,
  );
}

type PhotoRow = {
  id: string;
  r2_key_original: string;
  file_size: number;
  sender_name: string | null;
  session_id: string | null;
  created_at: number;
};

type Selected = {
  id: string;
  r2Key: string;
  fileSize: number;
  senderName: string | null;
  filename: string;
};

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** カンマ区切りの photo_ids を検証しつつ重複を落とす */
function parseIds(raw: string): string[] {
  const seen = new Set<string>();
  for (const id of raw.split(",")) {
    const trimmed = id.trim();
    if (UUID_V4.test(trimmed)) seen.add(trimmed.toLowerCase());
  }
  return [...seen];
}

/**
 * 省略・空文字は既定値 (JST) にする。
 * `Number(null)` / `Number("")` はどちらも 0 = UTC になるので、先に弾かないと
 * 単体 DL (`TzOffsetMinQuery` の default 540) と食い違う。
 */
function parseTzOffset(raw: File | string | null): number {
  if (typeof raw !== "string" || raw.trim() === "") return DEFAULT_TZ_OFFSET_MIN;
  const value = Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_TZ_OFFSET_MIN;
  return Math.min(840, Math.max(-720, Math.trunc(value)));
}

/**
 * 全 completed 写真から ID 引きのマップを作り、DL ファイル名を確定させる。
 * ファイル名は単体 DL (`GET /receiver/photos/:id/download`) と同じ
 * `受信日時_連番.jpg` 形式で、連番は同一セッション内の順番。
 * 順序定義 (created_at ASC, id ASC) も単体 DL の相関サブクエリと揃えている。
 */
function indexPhotos(rows: PhotoRow[], tzOffsetMin: number): Map<string, Selected> {
  const sessionCounts = new Map<string, number>();
  const out = new Map<string, Selected>();
  for (const row of rows) {
    const key = row.session_id ?? `__solo__${row.id}`;
    const index = (sessionCounts.get(key) ?? 0) + 1;
    sessionCounts.set(key, index);
    out.set(row.id, {
      id: row.id,
      r2Key: row.r2_key_original,
      fileSize: row.file_size,
      senderName: row.sender_name,
      filename: buildDownloadFilename(row.created_at, index, tzOffsetMin),
    });
  }
  return out;
}

/** 受信日時_連番.jpg 形式のファイル名を生成 (tzOffsetMin のタイムゾーン基準) */
function buildDownloadFilename(
  createdAt: number,
  sessionIndex: number,
  tzOffsetMin: number,
): string {
  const local = new Date((createdAt + tzOffsetMin * 60) * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${local.getUTCFullYear()}${pad(local.getUTCMonth() + 1)}${pad(local.getUTCDate())}`;
  const time = `${pad(local.getUTCHours())}${pad(local.getUTCMinutes())}${pad(local.getUTCSeconds())}`;
  return `${date}-${time}_${String(sessionIndex).padStart(2, "0")}.jpg`;
}

function zipName(handle: string, tzOffsetMin: number): string {
  const local = new Date(Date.now() + tzOffsetMin * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${local.getUTCFullYear()}${pad(local.getUTCMonth() + 1)}${pad(local.getUTCDate())}` +
    `${pad(local.getUTCHours())}${pad(local.getUTCMinutes())}${pad(local.getUTCSeconds())}`;
  return `furdrop-${handle}-${stamp}.zip`;
}

/** 同名が来たら `_2`, `_3` を付ける (別セッションで日時と連番が衝突しうる) */
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

/**
 * ZIP に入れられなかった写真の一覧。
 * Workers 側に i18n の仕組みが無いので、日英を併記して済ませる。
 * 「見つからなかった ID」は生の UUID を出してもユーザーには意味がないので件数だけ。
 */
function missingNote(failed: string[], notFoundCount: number): string {
  const lines = [
    "この ZIP に含まれていない写真があります。",
    "Some photos are not included in this ZIP.",
    "",
  ];
  if (failed.length > 0) {
    lines.push("取得に失敗 / Failed to retrieve:", ...failed, "");
  }
  if (notFoundCount > 0) {
    lines.push(
      `すでに削除されている写真: ${notFoundCount} 件`,
      `Already deleted: ${notFoundCount} photo(s)`,
      "",
    );
  }
  return lines.join("\n");
}

function bytesStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}
