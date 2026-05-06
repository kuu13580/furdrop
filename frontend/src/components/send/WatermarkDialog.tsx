import { useEffect, useRef, useState } from "react";
import {
  drawWatermark,
  WATERMARK_FONT_STACKS,
  type WatermarkFontFamily,
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

const FONT_FAMILIES: { value: WatermarkFontFamily; label: string }[] = [
  { value: "sans", label: "ゴシック" },
  { value: "serif", label: "明朝" },
  { value: "mono", label: "等幅" },
];

/** 透かし位置 → ズーム時の transform-origin (% x, % y) */
const POSITION_ORIGIN: Record<WatermarkPosition, { x: number; y: number }> = {
  "top-left": { x: 0, y: 0 },
  "top-center": { x: 50, y: 0 },
  "top-right": { x: 100, y: 0 },
  "middle-left": { x: 0, y: 50 },
  "middle-center": { x: 50, y: 50 },
  "middle-right": { x: 100, y: 50 },
  "bottom-left": { x: 0, y: 100 },
  "bottom-center": { x: 50, y: 100 },
  "bottom-right": { x: 100, y: 100 },
};

const PREVIEW_MAX = 800;
const ZOOM_SCALE = 2.5;

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
  /** 透かし位置を中心にズームするトグル。開いた直後は実寸感を確認しやすいよう拡大状態 */
  const [zoomed, setZoomed] = useState(true);

  // ダイアログopen時に1枚目をビットマップ化してキャッシュ
  useEffect(() => {
    if (!open) {
      setZoomed(true);
    }
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
      size="md"
      footer={
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            完了
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-surface-canvas">
          {previewFile && !previewError ? (
            <>
              <canvas
                ref={canvasRef}
                className="h-full w-full select-none object-contain"
                style={{
                  transform: zoomed ? `scale(${ZOOM_SCALE})` : undefined,
                  transformOrigin: zoomed
                    ? `${POSITION_ORIGIN[options.position].x}% ${POSITION_ORIGIN[options.position].y}%`
                    : undefined,
                  transition: "transform 150ms ease-out",
                }}
              />
              <button
                type="button"
                onClick={() => setZoomed((v) => !v)}
                aria-label={zoomed ? "ズーム解除" : "透かし箇所をズーム"}
                aria-pressed={zoomed}
                className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full shadow-card transition-colors ${
                  zoomed ? "bg-brand text-white" : "bg-surface/90 text-ink-soft hover:bg-surface"
                }`}
              >
                <ZoomIcon zoomed={zoomed} />
              </button>
            </>
          ) : (
            <p className="px-4 text-center text-[13px] text-ink-soft">
              {previewError ?? "プレビュー用の画像がありません"}
            </p>
          )}
        </div>

        {!text && (
          <p className="rounded-xl border border-status-warn/30 bg-status-warn/10 px-3 py-2 text-[13px] text-ink">
            送信者名が未入力です。透かしには送信者名が使われます
          </p>
        )}

        <div>
          <p className="mb-2 block text-[13px] font-medium text-ink-soft">位置</p>
          <div className="grid w-24 grid-cols-3 gap-1">
            {POSITIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onChange({ ...options, position: p })}
                aria-label={p}
                className={`h-6 w-6 rounded-md border transition-colors ${
                  options.position === p
                    ? "border-brand bg-brand"
                    : "border-surface-sand-deep bg-surface hover:bg-surface-sand"
                }`}
              />
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="wmSize" className="block text-[13px] font-medium text-ink-soft">
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
            className="w-full accent-brand"
          />
        </div>

        <div>
          <label htmlFor="wmOpacity" className="block text-[13px] font-medium text-ink-soft">
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
            className="w-full accent-brand"
          />
        </div>

        <div>
          <p className="mb-1 block text-[13px] font-medium text-ink-soft">フォント</p>
          <div
            role="radiogroup"
            aria-label="フォント"
            className="grid grid-cols-3 gap-1 rounded-xl bg-surface-sand p-1"
          >
            {FONT_FAMILIES.map((f) => {
              const active = options.fontFamily === f.value;
              return (
                <label
                  key={f.value}
                  className={`flex cursor-pointer items-center justify-center rounded-lg px-2 py-1.5 text-[13px] transition-colors ${
                    active ? "bg-surface text-ink shadow-card" : "text-ink-soft hover:text-ink"
                  }`}
                  style={{ fontFamily: WATERMARK_FONT_STACKS[f.value] }}
                >
                  <input
                    type="radio"
                    name="watermark-font"
                    value={f.value}
                    checked={active}
                    onChange={() => onChange({ ...options, fontFamily: f.value })}
                    className="sr-only"
                  />
                  {f.label}
                </label>
              );
            })}
          </div>
        </div>

        <details className="group rounded-xl border border-surface-sand-deep bg-surface-canvas/40">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:bg-surface-sand">
            <span>詳細設定（色・縁取り）</span>
            <ChevronIcon />
          </summary>
          <div className="space-y-3 px-3 pb-3 pt-1">
            <div>
              <p className="mb-1 block text-[13px] font-medium text-ink-soft">色</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ ...options, color: "#ffffff" })}
                  className={`h-7 w-12 rounded-md border-2 bg-white text-[13px] text-ink transition-colors ${
                    options.color === "#ffffff" ? "border-brand" : "border-surface-sand-deep"
                  }`}
                >
                  白
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...options, color: "#000000" })}
                  className={`h-7 w-12 rounded-md border-2 bg-ink text-[13px] text-white transition-colors ${
                    options.color === "#000000" ? "border-brand" : "border-ink-soft"
                  }`}
                >
                  黒
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...options, color: "auto" })}
                  className={`h-7 rounded-md border-2 bg-gradient-to-r from-ink from-50% to-white to-50% px-3 text-[12px] font-medium transition-colors ${
                    options.color === "auto" ? "border-brand" : "border-surface-sand-deep"
                  }`}
                  title="描画領域の明るさから白/黒を自動選択"
                >
                  <span className="text-white">自</span>
                  <span className="text-ink">動</span>
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-[13px] font-medium text-ink-soft">
              <input
                type="checkbox"
                checked={options.stroke}
                onChange={(e) => onChange({ ...options, stroke: e.target.checked })}
                className="h-4 w-4 accent-brand"
              />
              <span>縁取り（反対色のアウトラインで視認性UP）</span>
            </label>
          </div>
        </details>
      </div>
    </Dialog>
  );
}

function ChevronIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="開閉"
      className="text-ink-muted transition-transform group-open:rotate-180"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ZoomIcon({ zoomed }: { zoomed: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={zoomed ? "ズーム解除" : "ズーム"}
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
      {!zoomed && <line x1="11" y1="8" x2="11" y2="14" />}
    </svg>
  );
}
