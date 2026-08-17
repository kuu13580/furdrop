import { useAtom } from "jotai";
import { useCallback, useRef, useState } from "react";
import type { ExifCreditMode } from "../lib/exif-credit";
import { DEFAULT_DOWNLOAD_OPTIONS, downloadOptionsAtom } from "../stores/download";

type DownloadRunner = (mode: ExifCreditMode) => void;

/**
 * R17: DL 時の EXIF 記録設定を管理する。
 *
 * 未設定のまま DL しようとしたときだけダイアログを挟んで一度選ばせ、以降は保存値で即 DL する。
 * 「気づかないまま既定の挙動で保存され続ける」ことを避けつつ、繰り返し DL の摩擦も作らないため。
 */
export function useDownloadOptions() {
  const [options, setOptions] = useAtom(downloadOptionsAtom);
  const [dialog, setDialog] = useState<"confirm" | "edit" | null>(null);
  const pendingRef = useRef<DownloadRunner | null>(null);

  const mode = options?.exifCredit ?? DEFAULT_DOWNLOAD_OPTIONS.exifCredit;

  /** 設定済みならそのまま実行、未設定なら選ばせてから実行する */
  const startDownload = useCallback(
    (run: DownloadRunner) => {
      if (options) {
        run(options.exifCredit);
        return;
      }
      pendingRef.current = run;
      setDialog("confirm");
    },
    [options],
  );

  const openEditor = useCallback(() => {
    pendingRef.current = null;
    setDialog("edit");
  }, []);

  const closeDialog = useCallback(() => {
    pendingRef.current = null;
    setDialog(null);
  }, []);

  const submitDialog = useCallback(
    (next: ExifCreditMode) => {
      setOptions({ exifCredit: next });
      const run = pendingRef.current;
      pendingRef.current = null;
      setDialog(null);
      run?.(next);
    },
    [setOptions],
  );

  return {
    /** 現在の記録設定 (未設定のときは既定値) */
    mode,
    startDownload,
    openEditor,
    dialogProps: {
      open: dialog !== null,
      purpose: dialog ?? "confirm",
      value: mode,
      onClose: closeDialog,
      onSubmit: submitDialog,
    },
  } as const;
}
