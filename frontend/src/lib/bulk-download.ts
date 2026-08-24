import { msg } from "@lingui/core/macro";
import { API_BASE_URL } from "./api";
import type { ExifCreditMode } from "./exif-credit";
import { auth } from "./firebase";
import { formatBytes } from "./format";
import { i18n } from "./i18n";
import { getTzOffsetMin } from "./timezone";

/**
 * R08: 一括ダウンロード。Workers が ZIP をストリーミングで返すのを
 * **隠しフォームの POST** で受け取る。
 *
 * - ブラウザのダウンロードは `Authorization` ヘッダを送れず、API は別オリジンなので
 *   Cookie も third-party 扱いで Safari の ITP に潰される。そのため ID トークンと
 *   写真 ID をフォームのボディに載せる (URL に載せると UUID 数百個で数十KB になる)
 * - `target="_self"` を使う。`Content-Disposition: attachment` のレスポンスは
 *   ナビゲーションを置き換えないのでページはそのまま残り、ポップアップブロッカーも
 *   ジェスチャ連鎖も原理的に関与しない (実機で確認済み)
 * - ただし**サーバーがエラー JSON を返すと SPA から離脱してしまう**ので、
 *   先に `dry_run` で検証を通してからフォームを submit する
 */

export type BulkDownloadResult = { ok: true } | { ok: false; message: string };

type DryRunError = {
  error?: {
    code?: string;
    message?: string;
    limit_bytes?: number;
    selected_bytes?: number;
    selected_count?: number;
  };
};

export async function startBulkDownload(args: {
  photoIds: string[];
  exifCredit: ExifCreditMode;
}): Promise<BulkDownloadResult> {
  const { photoIds, exifCredit } = args;
  if (photoIds.length === 0) return { ok: true };

  const user = auth.currentUser;
  if (!user) {
    return {
      ok: false,
      message: i18n._(msg`ログインの有効期限が切れました。再度ログインしてください。`),
    };
  }

  const fields = {
    token: await user.getIdToken(),
    photo_ids: photoIds.join(","),
    exif_credit: exifCredit,
    tz_offset_min: String(getTzOffsetMin()),
  };

  const check = await dryRun(fields);
  if (!check.ok) return check;

  submitHiddenForm(fields);
  return { ok: true };
}

async function dryRun(fields: Record<string, string>): Promise<BulkDownloadResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/download/zip`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...fields, dry_run: "1" }).toString(),
    });
  } catch {
    return {
      ok: false,
      message: i18n._(msg`ダウンロードを開始できませんでした。通信環境をご確認ください。`),
    };
  }

  if (res.ok) return { ok: true };

  const body = (await res.json().catch(() => ({}))) as DryRunError;
  if (body.error?.code === "SELECTION_TOO_LARGE") {
    // 「何枚減らせばいいか」の判断材料になるので選択量と上限を出す
    const selected = formatBytes(body.error.selected_bytes ?? 0);
    const limit = formatBytes(body.error.limit_bytes ?? 0);
    return {
      ok: false,
      message: i18n._(
        msg`選択した写真が大きすぎます (${selected} / 1回の上限 ${limit})。枚数を減らして何回かに分けてダウンロードしてください。`,
      ),
    };
  }
  if (res.status === 404) {
    return {
      ok: false,
      message: i18n._(
        msg`選択した写真が見つかりませんでした。すでに削除されている可能性があります。一覧を再読み込みしてお試しください。`,
      ),
    };
  }
  if (res.status === 429) {
    return {
      ok: false,
      message: i18n._(msg`ダウンロードの回数が多すぎます。1分ほど時間をおいてからお試しください。`),
    };
  }
  if (res.status === 401) {
    return {
      ok: false,
      message: i18n._(msg`ログインの有効期限が切れました。再度ログインしてください。`),
    };
  }
  return {
    ok: false,
    message: i18n._(msg`ダウンロードを開始できませんでした。時間をおいてお試しください。`),
  };
}

function submitHiddenForm(fields: Record<string, string>): void {
  const form = document.createElement("form");
  form.method = "post";
  form.action = `${API_BASE_URL}/download/zip`;
  // attachment レスポンスはページを置き換えないので _self で足りる
  form.target = "_self";
  form.style.display = "none";
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
  form.remove();
}
