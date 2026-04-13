import { atom } from "jotai";
import { DEFAULT_WATERMARK, type WatermarkOptions } from "../lib/image-processing";

export type SelectedFile = {
  id: string;
  file: File;
  previewUrl: string;
};

export type UploadFormState = {
  senderName: string;
  exifText: string;
  watermark: WatermarkOptions;
};

export const selectedFilesAtom = atom<SelectedFile[]>([]);

export const uploadFormAtom = atom<UploadFormState>({
  senderName: "",
  exifText: "",
  watermark: { ...DEFAULT_WATERMARK },
});
