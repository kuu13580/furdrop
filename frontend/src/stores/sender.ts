import { atom } from "jotai";
import { DEFAULT_WATERMARK, type WatermarkOptions } from "../lib/image-processing";

export type SelectedFile = {
  id: string;
  file: File;
  previewUrl: string;
};

export type UploadFormState = {
  senderName: string;
  /** EXIFカメラモデル欄に senderName を埋め込む */
  exifEnabled: boolean;
  /** 透かしを入れる。テキストは senderName を使う */
  watermarkEnabled: boolean;
  watermark: WatermarkOptions;
};

export const selectedFilesAtom = atom<SelectedFile[]>([]);

export const uploadFormAtom = atom<UploadFormState>({
  senderName: "",
  exifEnabled: false,
  watermarkEnabled: false,
  watermark: { ...DEFAULT_WATERMARK },
});
