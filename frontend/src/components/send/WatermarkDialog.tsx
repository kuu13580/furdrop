import { useEffect, useRef, useState } from "react";
import {
  drawWatermark,
  type WatermarkOptions,
  type WatermarkPosition,
} from "../../lib/image-processing";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";

const POSITIONS: WatermarkPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

const PREVIEW_MAX = 800;

type Props = {
  open: boolean;
  onClose: () => void;
  options: WatermarkOptions;
  onChange: (next: WatermarkOptions) => void;
  /** 透かしテキスト（通常は送信者名） */
  text: string;
  /** プレビューに使う1枚目の画像 (HEICは未対応) */
  previewFile: File | null;
};

export default function WatermarkDialog({
  open,
  onClose,
  options,
  onChange,
  text,
  previewFile,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);

  // ダイアログopen時に1枚目をビットマップ化してキャッシュ
  useEffect(() => {
    if (!open || !previewFile) {
      setPreviewReady(false);
      return;
    }
    let cancelled = false;
    setPreviewError(null);
    setPreviewReady(false);
    createImageBitmap(previewFile, { imageOrientation: "from-image" })
      .then((b) => {
        if (cancelled) {
          b.close();
          return;
        }
        bitmapRef.current?.close();
        bitmapRef.current = b;
        setPreviewReady(true);
      })
      .catch(() => {
        if (!cancelled) setPreviewError("この画像形式ではプレビューできません");
      });
    return () => {
      cancelled = true;
    };
  }, [open, previewFile]);

  // unmount時のクリーンアップ
  useEffect(() => {
    return () => {
      bitmapRef.current?.close();
      bitmapRef.current = null;
    };
  }, []);

  // options/text/previewReady 変更でプレビュー再描画
  useEffect(() => {
    if (!previewReady) return;
    const bmp = bitmapRef.current;
    const canvas = canvasRef.current;
    if (!bmp || !canvas) return;

    const scale = Math.min(PREVIEW_MAX / bmp.width, PREVIEW_MAX / bmp.height, 1);
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // 出力JPEGと同じく透過部分を白埋め
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    drawWatermark(ctx, w, h, text, options);
  }, [previewReady, options, text]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="透かしの設定"
      footer={
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            完了
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md bg-gray-100">
          {previewFile && !previewError ? (
            <canvas ref={canvasRef} className="max-h-full max-w-full" />
          ) : (
            <p className="px-4 text-center text-xs text-gray-500">
              {previewError ?? "プレビュー用の画像がありません"}
            </p>
          )}
        </div>

        {!text && (
          <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
            送信者名が未入力です。透かしには送信者名が使われます
          </p>
        )}

        <div>
          <p className="mb-2 block text-xs font-medium text-gray-600">位置</p>
          <div className="grid w-24 grid-cols-3 gap-1">
            {POSITIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onChange({ ...options, position: p })}
                aria-label={p}
                className={`h-6 w-6 rounded-sm border ${
                  options.position === p
                    ? "border-blue-500 bg-blue-500"
                    : "border-gray-300 bg-white hover:bg-gray-100"
                }`}
              />
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="wmSize" className="block text-xs font-medium text-gray-600">
            サイズ ({(options.fontSizeRatio * 100).toFixed(1)}%)
          </label>
          <input
            id="wmSize"
            type="range"
            min="0.01"
            max="0.05"
            step="0.005"
            value={options.fontSizeRatio}
            onChange={(e) =>
              onChange({ ...options, fontSizeRatio: Number.parseFloat(e.target.value) })
            }
            className="w-full"
          />
        </div>

        <div>
          <label htmlFor="wmOpacity" className="block text-xs font-medium text-gray-600">
            透明度 ({Math.round(options.opacity * 100)}%)
          </label>
          <input
            id="wmOpacity"
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={options.opacity}
            onChange={(e) => onChange({ ...options, opacity: Number.parseFloat(e.target.value) })}
            className="w-full"
          />
        </div>

        <div>
          <p className="mb-1 block text-xs font-medium text-gray-600">色</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onChange({ ...options, color: "#ffffff" })}
              className={`h-7 w-12 rounded border-2 bg-white ${
                options.color === "#ffffff" ? "border-blue-500" : "border-gray-300"
              }`}
            >
              白
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...options, color: "#000000" })}
              className={`h-7 w-12 rounded border-2 bg-black text-white ${
                options.color === "#000000" ? "border-blue-500" : "border-gray-700"
              }`}
            >
              黒
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...options, color: "auto" })}
              className={`h-7 rounded border-2 bg-gradient-to-r from-black from-50% to-white to-50% px-3 text-xs font-medium ${
                options.color === "auto" ? "border-blue-500" : "border-gray-300"
              }`}
              title="描画領域の明るさから白/黒を自動選択"
            >
              <span className="text-white">自</span>
              <span className="text-black">動</span>
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
          <input
            type="checkbox"
            checked={options.stroke}
            onChange={(e) => onChange({ ...options, stroke: e.target.checked })}
          />
          <span>縁取り（反対色のアウトラインで視認性UP）</span>
        </label>
      </div>
    </Dialog>
  );
}
