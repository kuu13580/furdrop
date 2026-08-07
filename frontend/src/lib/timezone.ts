/**
 * 日付グルーピングと DL ファイル名の「日境界」を決めるタイムゾーンオフセット。
 *
 * ギャラリーの日付見出しは、サーバー集計 (`date_counts`) とクライアント側の
 * `buildDateKeyAndLabel` の 2 箇所で日付キーを作る。**両者が同じオフセットを
 * 使わないと見出しと中身がずれる**ため、その単一のソースをここに置く。
 *
 * `Date.prototype.getTimezoneOffset()` は「UTC から西へ何分か」を返す
 * (JST なら -540) ので、符号を反転して「東が正」に揃える。
 */
export function getTzOffsetMin(): number {
  return -new Date().getTimezoneOffset();
}

/**
 * ギャラリーの日付グルーピング用キーとラベルを作る。
 *
 * キーはサーバー集計 (`date_counts`) と一致しなければならない。サーバーは
 * `strftime('%Y-%m-%d', datetime(created_at + tz_offset_min*60, 'unixepoch'))` で
 * 同じ計算をしている (どちらも「エポック秒をオフセット分ずらして UTC として整形」)。
 *
 * `tzOffsetMin` を引数で受けるのは、グルーピング 1 回のあいだオフセットを固定する
 * ため。写真ごとに `getTzOffsetMin()` を呼ぶと、タブを開いたまま DST 切替や
 * 端末の TZ 変更を跨いだときに見出しと中身がずれ得る。
 */
export function buildDateKeyAndLabel(
  createdAt: number,
  tzOffsetMin: number,
): { key: string; label: string } {
  const local = new Date((createdAt + tzOffsetMin * 60) * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = local.getUTCFullYear();
  const m = pad(local.getUTCMonth() + 1);
  const d = pad(local.getUTCDate());
  return { key: `${y}-${m}-${d}`, label: `${y}/${m}/${d}` };
}
