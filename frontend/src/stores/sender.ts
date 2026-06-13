import { atom } from "jotai";
import {
  type CreditFormat,
  DEFAULT_CREDIT_FORMAT,
  DEFAULT_WATERMARK,
  type WatermarkOptions,
} from "../lib/image-processing";

/** 元ファイルのメタ情報。実体 (bytes) は IndexedDB に id をキーに保存する。 */
export type SelectedFileMeta = {
  name: string;
  type: string;
  size: number;
};

export type SelectedFile = {
  id: string;
  /**
   * 元ファイルのメタ情報。実体の bytes は state に持たず、IndexedDB (photo-store)
   * に id をキーに保存し、プレビュー生成・アップロード時に都度取り出す。
   * RAM 常駐量を抑え、Android の content:// スナップショット失効も回避するため。
   */
  file: SelectedFileMeta;
  /** プレビュー用サムネ (長辺 400px) の ObjectURL。未生成時は空文字。 */
  previewUrl: string;
  /** サムネ生成試行済み (成功 or 失敗が確定) */
  previewReady: boolean;
};

export type UploadFormState = {
  senderName: string;
  /** クレジット文字列のフォーマット（EXIF / 透かしの両方に適用） */
  creditFormat: CreditFormat;
  /** EXIFカメラモデル欄に senderName を埋め込む */
  exifEnabled: boolean;
  /** 透かしを入れる。テキストは senderName を使う */
  watermarkEnabled: boolean;
  watermark: WatermarkOptions;
};

export const selectedFilesAtom = atom<SelectedFile[]>([]);

export const uploadFormAtom = atom<UploadFormState>({
  senderName: "",
  creditFormat: DEFAULT_CREDIT_FORMAT,
  exifEnabled: false,
  watermarkEnabled: false,
  watermark: { ...DEFAULT_WATERMARK },
});
