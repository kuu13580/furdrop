import { atomWithStorage, createJSONStorage } from "jotai/utils";
import { type ExifCreditMode, isExifCreditMode } from "../lib/exif-credit";

/** R17: 受信者のダウンロード設定。受信オプション (R14) とは別物で、この端末にだけ効く */
export type DownloadOptions = {
  /** DL する写真の EXIF に送信者名を書き込むか */
  exifCredit: ExifCreditMode;
};

export const DEFAULT_DOWNLOAD_OPTIONS: DownloadOptions = { exifCredit: "artist_model" };

const baseStorage = createJSONStorage<DownloadOptions | null>(() => localStorage);

/** 保存値を検証する。未設定 (null) は「初回 DL でダイアログを出す」の意味を持つ */
function sanitize(raw: unknown): DownloadOptions | null {
  if (typeof raw !== "object" || raw === null) return null;
  const mode = (raw as Record<string, unknown>).exifCredit;
  return isExifCreditMode(mode) ? { exifCredit: mode } : null;
}

/**
 * null のあいだは未設定。受信者が初めて DL するときにダイアログで選ばせ、以降はこの値を使う。
 * 端末ごとの好み (どのアプリで写真を見るか) に紐づく設定なのでサーバには持たせない。
 */
export const downloadOptionsAtom = atomWithStorage<DownloadOptions | null>(
  "furdrop.downloadOptions",
  null,
  {
    ...baseStorage,
    getItem: (key, initialValue) => sanitize(baseStorage.getItem(key, initialValue)),
  },
  { getOnInit: true },
);
