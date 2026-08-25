import { atom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import {
  createDefaultWatermarkElements,
  sanitizeWatermarkElements,
  type WatermarkElement,
} from "../lib/watermark";

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

/**
 * 透かしプレビューの候補画像。WatermarkDialog のセレクタ表示に使う最小情報。
 * 実体 (File) は選択時に getFile で IndexedDB から都度取り出す (RAM 常駐を避ける)。
 */
export type PreviewCandidate = {
  id: string;
  name: string;
  /** 元ファイルの MIME。File 復元時に渡す (HEIC 判定は name/type 両方を見るため) */
  type: string;
  /** 非HEIC: サムネ ObjectURL / HEIC: "" (サムネ無し、プレースホルダ表示) */
  thumbUrl: string;
  isHeic: boolean;
};

export type UploadFormState = {
  senderName: string;
  /** 透かしを入れる */
  watermarkEnabled: boolean;
  /** 透かし要素 (最大5) */
  watermarkElements: WatermarkElement[];
};

export const selectedFilesAtom = atom<SelectedFile[]>([]);

function defaultUploadForm(): UploadFormState {
  return {
    senderName: "",
    watermarkEnabled: false,
    watermarkElements: createDefaultWatermarkElements(),
  };
}

/** localStorage から復元した値を検証・正規化する (旧形式・破損データはデフォルトへ) */
function sanitizeUploadForm(raw: unknown): UploadFormState {
  const base = defaultUploadForm();
  if (typeof raw !== "object" || raw === null) return base;
  const r = raw as Record<string, unknown>;
  const elements = sanitizeWatermarkElements(r.watermarkElements);
  return {
    senderName: typeof r.senderName === "string" ? r.senderName.slice(0, 100) : base.senderName,
    watermarkEnabled: r.watermarkEnabled === true,
    watermarkElements: elements.length > 0 ? elements : base.watermarkElements,
  };
}

const uploadFormBaseStorage = createJSONStorage<UploadFormState>(() => localStorage);

let uploadFormWriteTimer: number | undefined;
let pendingUploadFormWrite: (() => void) | null = null;

const flushUploadFormWrite = () => {
  if (!pendingUploadFormWrite) return;
  window.clearTimeout(uploadFormWriteTimer);
  const write = pendingUploadFormWrite;
  pendingUploadFormWrite = null;
  write();
};

if (typeof window !== "undefined") {
  // タブ閉じ・ページ遷移時にデバウンス中の書き込みを失わない (bfcache 対応のため pagehide)
  window.addEventListener("pagehide", flushUploadFormWrite);
}

/**
 * 送信者名・受信設定・透かしデザインを localStorage に永続化する。
 * 名刺やSNSのURLから繰り返し送るリピート送信者が、前回の設定をそのまま使えるようにする。
 */
export const uploadFormAtom = atomWithStorage<UploadFormState>(
  "furdrop.uploadForm",
  defaultUploadForm(),
  {
    ...uploadFormBaseStorage,
    getItem: (key, initialValue) =>
      sanitizeUploadForm(uploadFormBaseStorage.getItem(key, initialValue)),
    // 透かし要素のドラッグ中は毎フレーム set が走るため、同期 I/O である
    // localStorage.setItem をデバウンスしてホットパスから外す
    setItem: (key, value) => {
      window.clearTimeout(uploadFormWriteTimer);
      pendingUploadFormWrite = () => uploadFormBaseStorage.setItem(key, value);
      uploadFormWriteTimer = window.setTimeout(flushUploadFormWrite, 300);
    },
    // デバウンス中の書き込みが削除後に復活しないよう、保留分を破棄してから消す
    removeItem: (key) => {
      window.clearTimeout(uploadFormWriteTimer);
      pendingUploadFormWrite = null;
      uploadFormBaseStorage.removeItem(key);
    },
  },
  // 起動直後の描画から保存値を使う (デフォルト→保存値のちらつき防止)
  { getOnInit: true },
);
