import { useEffect, useRef, useState } from "react";
import {
  drawWatermark,
  ensureWatermarkFont,
  tryLoadBitmap,
  WATERMARK_FONT_STACKS,
  type WatermarkFontFamily,
  type WatermarkOptions,
  type WatermarkPosition,
} from "../../lib/image-processing";
import type { PreviewCandidate } from "../../stores/sender";
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
  { value: "pop", label: "ポップ" },
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
/** プレビュー枠のアスペクト比 (aspect-video = 16:9)。cover 倍率と原点補正の基準 */
const BOX_AR = 16 / 9;
/** ズーム倍率の上限。拡大しすぎてピクセルが粗くならないようクランプ */
const MAX_ZOOM = 6;
/** 透かしサイズ比に反比例したズームの基準値。この比のとき size 由来ズーム=等倍。
 *  これより小さい透かしほど大きく拡大して見やすくする (デフォルト 0.02 なら約3倍)。 */
const REF_FONT_RATIO = 0.06;

type Props = {
  open: boolean;
  onClose: () => void;
  options: WatermarkOptions;
  onChange: (next: WatermarkOptions) => void;
  /** 透かしテキスト（通常は送信者名） */
  text: string;
  /**
   * プレビュー候補。セレクタに並べ、初期は先頭から順に decode を試し最初に成功した
   * 1 枚を自動表示する。HEIC は heic-to のフォールバックで decode する。
   */
  candidates: PreviewCandidate[];
  /** 候補の実体 File を IndexedDB から都度取り出すコールバック */
  getFile: (id: string, name: string, type: string) => Promise<File>;
};

export default function WatermarkDialog({
  open,
  onClose,
  options,
  onChange,
  text,
  candidates,
  getFile,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  /** プレビュー対象の候補 id。null = 初期自動選択 (先頭から最初に decode 成功した候補) */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** 読み込んだ画像のアスペクト比。cover 倍率と transform-origin 補正に使う */
  const [imgAR, setImgAR] = useState<number | null>(null);
  /** 透かし位置を中心にズームするトグル。開いた直後はまず全体表示 (OFF) */
  const [zoomed, setZoomed] = useState(false);
  /** ズームボタンの「ズームできます」ヒント表示 (open ごとに最初の3秒だけ) */
  const [showZoomHint, setShowZoomHint] = useState(false);
  const zoomHintShownRef = useRef(false);
  /** 現在 bitmapRef に読み込み済みの候補 id。同一 id の再 decode を避ける */
  const loadedIdRef = useRef<string | null>(null);

  // 閉じる時はステートをリセットして次回 open に持ち越さない
  useEffect(() => {
    if (open) return;
    setSelectedId(null);
    setImgAR(null);
    setZoomed(false);
    setPreviewReady(false);
    setPreviewLoading(false);
    setPreviewError(null);
    setShowZoomHint(false);
    zoomHintShownRef.current = false;
    loadedIdRef.current = null;
    bitmapRef.current?.close();
    bitmapRef.current = null;
  }, [open]);

  // decode: selectedId===null なら候補を先頭から試し最初の成功を採用 (自動表示)。
  // selectedId 指定時はその 1 枚だけ decode (セレクタでの手動切替)。
  useEffect(() => {
    if (!open) return;
    if (candidates.length === 0) {
      setPreviewReady(false);
      setPreviewLoading(false);
      setPreviewError("プレビューできる画像がありません");
      return;
    }
    // 自動採用で selectedId が確定した直後など、既に読み込み済みの候補なら再 decode しない
    if (selectedId !== null && loadedIdRef.current === selectedId) return;
    const queue = selectedId === null ? candidates : candidates.filter((c) => c.id === selectedId);
    if (queue.length === 0) return;
    let cancelled = false;
    setPreviewError(null);
    setPreviewReady(false);
    setPreviewLoading(true);
    (async () => {
      for (const cand of queue) {
        if (cancelled) return;
        let bmp: ImageBitmap | null = null;
        try {
          const file = await getFile(cand.id, cand.name, cand.type);
          bmp = await tryLoadBitmap(file);
        } catch {
          bmp = null;
        }
        if (cancelled) {
          bmp?.close();
          return;
        }
        if (bmp) {
          bitmapRef.current?.close();
          bitmapRef.current = bmp;
          loadedIdRef.current = cand.id;
          setImgAR(bmp.width / bmp.height);
          setPreviewReady(true);
          setPreviewLoading(false);
          // 自動採用時はセレクタのハイライトを合わせる
          if (selectedId === null) setSelectedId(cand.id);
          return;
        }
      }
      if (!cancelled) {
        setPreviewError(
          selectedId === null
            ? "プレビューできる画像がありません"
            : "この画像はプレビューできません",
        );
        setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selectedId, candidates, getFile]);

  // プレビューが初めて表示できたら、最初の3秒だけズームのヒントを出す (open ごとに1回)
  useEffect(() => {
    if (!previewReady || zoomHintShownRef.current) return;
    zoomHintShownRef.current = true;
    setShowZoomHint(true);
    const t = setTimeout(() => setShowZoomHint(false), 3000);
    return () => clearTimeout(t);
  }, [previewReady]);

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

    let cancelled = false;
    // Web フォント (Noto Sans JP / Mochiy Pop One) を待ってから描画し、
    // 焼き込み結果とプレビューの字形を一致させる
    (async () => {
      if (text) await ensureWatermarkFont(options.fontFamily, text);
      if (cancelled) return;
      drawWatermark(ctx, w, h, text, options);
    })();
    return () => {
      cancelled = true;
    };
  }, [previewReady, options, text]);

  // ① ズーム倍率:
  //  - cover: 固定 16:9 枠の余白 (レターボックス) を解消する下限倍率 (画像比から算出)。
  //  - sizeZoom: 透かしサイズ比に反比例した倍率。小さい透かしほど大きく拡大して見やすくする。
  // 両者と等倍の最大を採り、上限でクランプ。overflow-hidden + 原点補正で透かし周辺を拡大する。
  const cover = imgAR ? Math.max(imgAR / BOX_AR, BOX_AR / imgAR) : 1;
  const sizeZoom = REF_FONT_RATIO / options.fontSizeRatio;
  const zoomScale = Math.min(Math.max(cover, sizeZoom, 1), MAX_ZOOM);
  // transform-origin 補正: object-contain のレターボックス分を考慮し、透かし位置を
  // 画像コンテンツ矩形へマッピングする (縦長画像で余白の角を指してずれるのを防ぐ)。
  const fracW = imgAR ? (imgAR >= BOX_AR ? 1 : imgAR / BOX_AR) : 1;
  const fracH = imgAR ? (imgAR >= BOX_AR ? BOX_AR / imgAR : 1) : 1;
  const posOrigin = POSITION_ORIGIN[options.position];
  const originX = (1 - fracW) * 50 + posOrigin.x * fracW;
  const originY = (1 - fracH) * 50 + posOrigin.y * fracH;

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
          {!previewError ? (
            <>
              <canvas
                ref={canvasRef}
                className="h-full w-full select-none object-contain"
                style={{
                  transform: zoomed ? `scale(${zoomScale})` : undefined,
                  transformOrigin: zoomed ? `${originX}% ${originY}%` : undefined,
                  transition: "transform 150ms ease-out",
                }}
              />
              {previewLoading && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-surface-canvas/80 text-[13px] text-ink-soft">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink-muted border-t-transparent" />
                  <span>プレビューを読み込み中…</span>
                </div>
              )}
              {previewReady && (
                <>
                  <button
                    type="button"
                    onClick={() => setZoomed((v) => !v)}
                    aria-label={zoomed ? "ズーム解除" : "透かし箇所をズーム"}
                    aria-pressed={zoomed}
                    className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full shadow-card transition-colors ${
                      zoomed
                        ? "bg-brand text-white"
                        : "bg-surface/90 text-ink-soft hover:bg-surface"
                    }`}
                  >
                    <ZoomIcon zoomed={zoomed} />
                  </button>
                  {showZoomHint && !zoomed && (
                    <div className="pointer-events-none absolute right-2 top-11 rounded-lg bg-ink/90 px-2 py-1 text-[11px] text-white shadow-card">
                      ズームできます
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <p className="px-4 text-center text-[13px] text-ink-soft">{previewError}</p>
          )}
        </div>

        {candidates.length > 1 && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {candidates.map((c) => {
              const active = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  aria-label={`${c.name} をプレビュー`}
                  aria-pressed={active}
                  className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                    active ? "border-brand" : "border-transparent hover:border-surface-sand-deep"
                  }`}
                >
                  {c.thumbUrl ? (
                    <img src={c.thumbUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-surface-sand font-mono text-[10px] font-semibold text-ink-soft">
                      {c.isHeic ? "HEIC" : "…"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

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
            min="0.005"
            max="0.08"
            step="0.002"
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
            className="grid grid-cols-4 gap-1 rounded-xl bg-surface-sand p-1"
          >
            {FONT_FAMILIES.map((f) => {
              const active = options.fontFamily === f.value;
              return (
                <label
                  key={f.value}
                  className={`flex h-9 cursor-pointer items-center justify-center rounded-lg px-2 text-[13px] leading-none transition-colors ${
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
