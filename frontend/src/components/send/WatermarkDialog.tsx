import { Trans, useLingui } from "@lingui/react/macro";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { tryLoadBitmap } from "../../lib/image-processing";
import {
  clamp,
  createWatermarkElement,
  createWatermarkRectElement,
  deriveAnchorPlacement,
  drawWatermarkElements,
  ensureWatermarkFontCss,
  ensureWatermarkFonts,
  getWatermarkFont,
  isCustomWatermarkColor,
  MAX_WATERMARK_ELEMENTS,
  preloadWatermarkFontLabels,
  resolveWatermarkElements,
  WATERMARK_FONT_CATEGORIES,
  WATERMARK_FONTS,
  WATERMARK_PALETTES,
  WATERMARK_RANGES,
  type WatermarkElement,
  type WatermarkElementLayout,
  type WatermarkPlacementInput,
  watermarkDrawOrder,
  watermarkElementCenter,
  watermarkFontStack,
} from "../../lib/watermark";
import type { PreviewCandidate } from "../../stores/sender";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import LoadingSpinner from "../ui/LoadingSpinner";

const PREVIEW_MAX = 800;
/**
 * プレビュー枠のアスペクト比の可動範囲。枠は画像の縦横比に追従させ、
 * レターボックスを減らして「触れる画像領域」を最大化する (特にモバイル縦写真)。
 * 極端な縦長 (9:16 等) は 3:4 で頭打ちにし、ダイアログが伸びすぎないようにする。
 */
const BOX_AR_MIN = 3 / 4;
const BOX_AR_MAX = 16 / 9;
/** ズーム倍率の上限 (wheel / ピンチ)。拡大しすぎてピクセルが粗くならないためのクランプ */
const MAX_ZOOM = 6;
/** ヒットテスト時に要素矩形へ足すタップ猶予 (CSS px)。指は太いのでタッチは広めに取る */
const HIT_PADDING_CSS = { mouse: 12, touch: 22 };
/** タッチ時にヒット矩形へ保証する最小サイズ (CSS px、44px タップターゲット基準) */
const MIN_TOUCH_TARGET_CSS = 44;

const FONTS_BY_CATEGORY = WATERMARK_FONT_CATEGORIES.map((cat) => ({
  ...cat,
  fonts: WATERMARK_FONTS.filter((f) => f.category === cat.id),
}));

type Props = {
  open: boolean;
  onClose: () => void;
  /** 透かし要素 (編集対象) */
  elements: WatermarkElement[];
  onChange: (next: WatermarkElement[]) => void;
  /** autoText 要素の解決に使うクレジット文字列 (送信者名由来、空もあり得る) */
  credit: string;
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
  elements,
  onChange,
  credit,
  candidates,
  getFile,
}: Props) {
  const { t, i18n } = useLingui();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  // 文言ではなく理由を持つ。decode の effect に `t` を巻き込むと、
  // 依存配列に載せた瞬間にロケール変更で再 decode が走ってしまう
  const [previewError, setPreviewError] = useState<"no-candidates" | "undecodable" | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  /** プレビュー対象の候補 id。null = 初期自動選択 (先頭から最初に decode 成功した候補) */
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  /** 読み込んだ画像のアスペクト比。プレビュー枠の縦横比追従に使う */
  const [imgAR, setImgAR] = useState<number | null>(null);
  /** 現在 bitmapRef に読み込み済みの候補 id。同一 id の再 decode を避ける */
  const loadedIdRef = useRef<string | null>(null);

  /** 選択中の透かし要素 id */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** 直近の描画レイアウト (ヒットテスト・選択枠・ズームターゲットに使う) */
  const layoutRef = useRef<Map<string, WatermarkElementLayout>>(new Map());
  /**
   * プレビューのビュー変換 (translate → scale の順で適用、origin は左上)。
   * wheel / ピンチ / パンで更新される。
   */
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  /** セッション内の縦横比が混在しているか (インライン注意の表示条件) */
  const [mixedAspect, setMixedAspect] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  /** 「文字をドラッグして配置できます」ヒント。初回ドラッグの少し後に消す */
  const [showDragHint, setShowDragHint] = useState(true);
  const dragHintTimerRef = useRef<number | null>(null);

  // ドラッグハンドラから最新の props / state を参照するための ref
  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const draggingRef = useRef(false);
  const dragElementIdRef = useRef<string | null>(null);
  const grabOffsetRef = useRef({ dx: 0, dy: 0 });
  const pendingPointRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  /** プレビュー枠 (transform の乗らない基準座標系)。wheel リスナーとローカル座標変換に使う */
  const previewBoxRef = useRef<HTMLDivElement>(null);
  /** 押下中の全ポインタ (ピンチ判定用) */
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  /** ピンチ開始時のスナップショット */
  const pinchRef = useRef<{
    dist: number;
    mid: { x: number; y: number };
    scale: number;
    tx: number;
    ty: number;
  } | null>(null);
  /** パン (ズーム中に要素外をドラッグ) 開始時のスナップショット */
  const panRef = useRef<{ pointerId: number; x: number; y: number; tx: number; ty: number } | null>(
    null,
  );

  const selected = elements.find((el) => el.id === selectedId) ?? null;

  // 開いた時に Google Fonts の CSS を注入しておく (実フォントは必要グリフ分だけ遅延ロード)
  useEffect(() => {
    if (!open) return;
    ensureWatermarkFontCss();
  }, [open]);

  // 開いた時に先頭要素を選択する (選択解除 (null) はユーザー操作として尊重するため、
  // ここ以外で null → 自動選択への復帰はしない)
  useEffect(() => {
    if (!open) return;
    setSelectedId((prev) => prev ?? elementsRef.current[0]?.id ?? null);
  }, [open]);

  // 選択中要素が消えたら (削除等) 先頭へフォールバック
  useEffect(() => {
    if (!open || selectedId === null) return;
    if (elements.some((el) => el.id === selectedId)) return;
    setSelectedId(elements[0]?.id ?? null);
  }, [open, elements, selectedId]);

  // 閉じる時はステートをリセットして次回 open に持ち越さない
  useEffect(() => {
    if (open) return;
    setSelectedCandidateId(null);
    setImgAR(null);
    setView({ scale: 1, tx: 0, ty: 0 });
    setPreviewReady(false);
    setPreviewLoading(false);
    setPreviewError(null);
    setSelectedId(null);
    setMixedAspect(false);
    setDragActive(false);
    setShowDragHint(true);
    if (dragHintTimerRef.current !== null) {
      window.clearTimeout(dragHintTimerRef.current);
      dragHintTimerRef.current = null;
    }
    loadedIdRef.current = null;
    draggingRef.current = false;
    activePointersRef.current.clear();
    pinchRef.current = null;
    panRef.current = null;
    bitmapRef.current?.close();
    bitmapRef.current = null;
  }, [open]);

  // decode: selectedCandidateId===null なら候補を先頭から試し最初の成功を採用 (自動表示)。
  // 指定時はその 1 枚だけ decode (セレクタでの手動切替)。
  useEffect(() => {
    if (!open) return;
    if (candidates.length === 0) {
      setPreviewReady(false);
      setPreviewLoading(false);
      setPreviewError("no-candidates");
      return;
    }
    if (selectedCandidateId !== null && loadedIdRef.current === selectedCandidateId) return;
    const queue =
      selectedCandidateId === null
        ? candidates
        : candidates.filter((c) => c.id === selectedCandidateId);
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
          // 別の写真に切り替えたらビューは全体表示へ戻す
          setView({ scale: 1, tx: 0, ty: 0 });
          setPreviewReady(true);
          setPreviewLoading(false);
          // 自動採用時はセレクタのハイライトを合わせる
          if (selectedCandidateId === null) setSelectedCandidateId(cand.id);
          return;
        }
      }
      if (!cancelled) {
        setPreviewError(selectedCandidateId === null ? "no-candidates" : "undecodable");
        setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selectedCandidateId, candidates, getFile]);

  // 縦横比の混在検出: サムネの実寸から縦/横/正方形を分類し、2 種類以上あれば注意を出す。
  // 判定結果は候補 id ごとにキャッシュし、開き直しで同じサムネを再デコードしない
  const aspectClassCacheRef = useRef(new Map<string, string>());
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const withThumb = candidates.filter((c) => c.thumbUrl);
    if (withThumb.length < 2) {
      setMixedAspect(false);
      return;
    }
    const cache = aspectClassCacheRef.current;
    (async () => {
      await Promise.all(
        withThumb
          .filter((c) => !cache.has(c.id))
          .map(
            (c) =>
              new Promise<void>((resolve) => {
                const img = new Image();
                img.onload = () => {
                  const r = img.naturalWidth / img.naturalHeight;
                  cache.set(c.id, r > 1.05 ? "landscape" : r < 0.95 ? "portrait" : "square");
                  resolve();
                };
                img.onerror = () => resolve();
                img.src = c.thumbUrl;
              }),
          ),
      );
      if (cancelled) return;
      const classes = new Set(
        withThumb.map((c) => cache.get(c.id)).filter((v): v is string => !!v),
      );
      setMixedAspect(classes.size >= 2);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, candidates]);

  // unmount時のクリーンアップ
  useEffect(() => {
    return () => {
      bitmapRef.current?.close();
      bitmapRef.current = null;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (dragHintTimerRef.current !== null) window.clearTimeout(dragHintTimerRef.current);
    };
  }, []);

  /** ビュー値をクランプする (等倍未満に縮小しない / コンテンツ外へパンしない) */
  const clampView = (scale: number, tx: number, ty: number) => {
    const box = previewBoxRef.current;
    const w = box?.clientWidth ?? 0;
    const h = box?.clientHeight ?? 0;
    const s = clamp(scale, 1, MAX_ZOOM);
    return {
      scale: s,
      tx: clamp(tx, w - w * s, 0),
      ty: clamp(ty, h - h * s, 0),
    };
  };

  /** プレビュー枠内のローカル座標 (px, py) を不動点として倍率を newScale に変更する */
  const zoomAtPoint = (px: number, py: number, newScale: number) => {
    const v = viewRef.current;
    const s = clamp(newScale, 1, MAX_ZOOM);
    // 不動点 p のコンテンツ座標 c = (p - t) / scale を保ったまま t' を解く
    const tx = px - ((px - v.tx) / v.scale) * s;
    const ty = py - ((py - v.ty) / v.scale) * s;
    setView(clampView(s, tx, ty));
  };

  // wheel ズーム: カーソル位置を不動点に拡大/縮小。
  // ページスクロールを止めるため passive:false のネイティブリスナーで登録する
  useEffect(() => {
    if (!open) return;
    const box = previewBoxRef.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      if (!previewReadyRef.current) return;
      e.preventDefault();
      const rect = box.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0022);
      zoomAtPointRef.current(
        e.clientX - rect.left,
        e.clientY - rect.top,
        viewRef.current.scale * factor,
      );
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [open]);
  const zoomAtPointRef = useRef(zoomAtPoint);
  zoomAtPointRef.current = zoomAtPoint;
  const previewReadyRef = useRef(previewReady);
  previewReadyRef.current = previewReady;

  // elements / credit / 選択変更でプレビュー再描画
  const loadedFontKeyRef = useRef("");
  useEffect(() => {
    if (!previewReady) return;
    const bmp = bitmapRef.current;
    const canvas = canvasRef.current;
    if (!bmp || !canvas) return;

    const resolved = resolveWatermarkElements(elements, credit);
    const scale = Math.min(PREVIEW_MAX / bmp.width, PREVIEW_MAX / bmp.height, 1);
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    // 自動色の輝度サンプリング (getImageData) を毎描画で行うため、リードバック最適化を指定
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const draw = () => {
      // width/height への代入はバッキングストアの再確保を伴うため、サイズ変更時のみ
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      // 出力JPEGと同じく透過部分を白埋め
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bmp, 0, 0, w, h);
      const layouts = drawWatermarkElements(ctx, w, h, resolved);
      layoutRef.current = new Map(layouts.map((l) => [l.id, l]));
      const sel = selectedId ? layoutRef.current.get(selectedId) : undefined;
      if (sel) drawSelectionOutline(ctx, sel);
    };

    // フォント・テキストが前回描画から変わっていなければロード待ちを飛ばして同期描画する
    // (ドラッグ中の毎フレームで document.fonts.load の往復とマイクロタスク遅延を挟まないため)
    const fontKey = resolved.map((el) => `${el.fontId}:${el.text}`).join(" ");
    if (fontKey === loadedFontKeyRef.current) {
      draw();
      return;
    }
    let cancelled = false;
    // Web フォントのロードを待ってから描画し、焼き込み結果とプレビューの字形を一致させる
    (async () => {
      await ensureWatermarkFonts(resolved);
      if (cancelled) return;
      loadedFontKeyRef.current = fontKey;
      draw();
    })();
    return () => {
      cancelled = true;
    };
  }, [previewReady, elements, credit, selectedId]);

  /** ポインタ座標 → キャンバス座標 (object-contain のレターボックスと CSS scale を補正) */
  const toCanvasPoint = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
    if (scale <= 0) return null;
    const contentW = canvas.width * scale;
    const contentH = canvas.height * scale;
    const offX = rect.left + (rect.width - contentW) / 2;
    const offY = rect.top + (rect.height - contentH) / 2;
    return { x: (e.clientX - offX) / scale, y: (e.clientY - offY) / scale, scale };
  };

  /** プレビュー枠内のローカル座標 (transform の乗らない基準座標系) */
  const toBoxPoint = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const box = previewBoxRef.current;
    if (!box) return { x: 0, y: 0 };
    const rect = box.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  /** 要素ドラッグを途中終了する (ピンチ開始時など、状態だけ畳む) */
  const cancelElementDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    dragElementIdRef.current = null;
    pendingPointRef.current = null;
    setDragActive(false);
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // 2本目の指が置かれたらピンチへ移行 (要素ドラッグ/パンは中断)
    if (activePointersRef.current.size === 2) {
      cancelElementDrag();
      panRef.current = null;
      const [p1, p2] = [...activePointersRef.current.values()];
      const box = previewBoxRef.current?.getBoundingClientRect();
      const v = viewRef.current;
      pinchRef.current = {
        dist: Math.hypot(p1.x - p2.x, p1.y - p2.y),
        mid: {
          x: (p1.x + p2.x) / 2 - (box?.left ?? 0),
          y: (p1.y + p2.y) / 2 - (box?.top ?? 0),
        },
        scale: v.scale,
        tx: v.tx,
        ty: v.ty,
      };
      return;
    }
    if (activePointersRef.current.size > 2) return;

    const pt = toCanvasPoint(e);
    if (!pt) return;
    const isTouch = e.pointerType === "touch";
    const pad = (isTouch ? HIT_PADDING_CSS.touch : HIT_PADDING_CSS.mouse) / pt.scale;
    // タッチはヒット矩形に 44px タップターゲット相当の最小サイズを保証する
    const minSize = isTouch ? MIN_TOUCH_TARGET_CSS / pt.scale : 0;
    // 描画順 (rect が背面) の後ろ = 上に重なっている方を優先してヒットテスト
    const drawn = watermarkDrawOrder(elementsRef.current)
      .reverse()
      .map((el) => ({ el, layout: layoutRef.current.get(el.id) }))
      .filter((x): x is { el: WatermarkElement; layout: WatermarkElementLayout } => !!x.layout);
    const hit = drawn.find(({ layout }) => {
      const padX = pad + Math.max(0, (minSize - layout.width) / 2);
      const padY = pad + Math.max(0, (minSize - layout.height) / 2);
      return (
        pt.x >= layout.left - padX &&
        pt.x <= layout.left + layout.width + padX &&
        pt.y >= layout.top - padY &&
        pt.y <= layout.top + layout.height + padY
      );
    });
    if (!hit) {
      // 要素外タップ: 選択を解除して点線をプレビューから消す
      setSelectedId(null);
      // ズーム中なら 1 本指/マウスでパン開始
      if (viewRef.current.scale > 1.001) {
        const local = toBoxPoint(e);
        const v = viewRef.current;
        panRef.current = { pointerId: e.pointerId, x: local.x, y: local.y, tx: v.tx, ty: v.ty };
        e.preventDefault();
      }
      return;
    }
    e.preventDefault();
    setSelectedId(hit.el.id);
    draggingRef.current = true;
    dragElementIdRef.current = hit.el.id;
    grabOffsetRef.current = { dx: hit.layout.cx - pt.x, dy: hit.layout.cy - pt.y };
    setDragActive(true);
  };

  /** ドラッグ位置から全要素のアンカー/オフセットを再導出して onChange する (rAF で間引き) */
  const applyDrag = () => {
    rafRef.current = null;
    const pt = pendingPointRef.current;
    const canvas = canvasRef.current;
    const dragId = dragElementIdRef.current;
    if (!pt || !canvas || !dragId || !draggingRef.current) return;
    const w = canvas.width;
    const h = canvas.height;
    const items: WatermarkPlacementInput[] = [];
    for (const el of elementsRef.current) {
      const layout = layoutRef.current.get(el.id);
      if (!layout) continue; // 空テキスト要素は配置対象外
      // 非ドラッグ要素はクランプ前の生中心を使う (クランプ結果を再入力すると座標が漂う)
      const { cx, cy } =
        el.id === dragId
          ? {
              cx: clamp(pt.x + grabOffsetRef.current.dx, 0, w),
              cy: clamp(pt.y + grabOffsetRef.current.dy, 0, h),
            }
          : watermarkElementCenter(el, w, h);
      items.push({
        id: el.id,
        cx,
        cy,
        width: layout.width,
        height: layout.height,
        fontSize: layout.fontSize,
      });
    }
    const placements = deriveAnchorPlacement(w, h, items);
    onChangeRef.current(
      elementsRef.current.map((el) => {
        const p = placements.get(el.id);
        return p ? { ...el, anchor: p.anchor, offset: p.offset } : el;
      }),
    );
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // ピンチ: 2本指の距離比でズームし、中点を不動点に保つ
    const pinch = pinchRef.current;
    if (pinch && activePointersRef.current.size >= 2) {
      e.preventDefault();
      const [p1, p2] = [...activePointersRef.current.values()];
      const box = previewBoxRef.current?.getBoundingClientRect();
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const mid = {
        x: (p1.x + p2.x) / 2 - (box?.left ?? 0),
        y: (p1.y + p2.y) / 2 - (box?.top ?? 0),
      };
      const s = clamp((pinch.scale * dist) / Math.max(1, pinch.dist), 1, MAX_ZOOM);
      // ピンチ開始時の中点コンテンツ座標を新しい中点に合わせる (ズーム + 2本指パンの合成)
      const cx = (pinch.mid.x - pinch.tx) / pinch.scale;
      const cy = (pinch.mid.y - pinch.ty) / pinch.scale;
      setView(clampView(s, mid.x - cx * s, mid.y - cy * s));
      return;
    }

    // パン: ズーム中の要素外ドラッグ
    const pan = panRef.current;
    if (pan && pan.pointerId === e.pointerId) {
      e.preventDefault();
      const local = toBoxPoint(e);
      const v = viewRef.current;
      setView(clampView(v.scale, pan.tx + (local.x - pan.x), pan.ty + (local.y - pan.y)));
      return;
    }

    if (!draggingRef.current) return;
    const pt = toCanvasPoint(e);
    if (!pt) return;
    e.preventDefault();
    pendingPointRef.current = { x: pt.x, y: pt.y };
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(applyDrag);
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) pinchRef.current = null;
    if (panRef.current?.pointerId === e.pointerId) panRef.current = null;
    endDrag();
  };

  const endDrag = () => {
    if (!draggingRef.current) return;
    cancelElementDrag();
    // 操作を覚えたらヒントは用済み。初回ドラッグの少し後に消す
    if (dragHintTimerRef.current === null) {
      dragHintTimerRef.current = window.setTimeout(() => setShowDragHint(false), 1200);
    }
  };

  const updateSelected = (patch: Partial<WatermarkElement>) => {
    if (!selectedId) return;
    onChange(elements.map((el) => (el.id === selectedId ? { ...el, ...patch } : el)));
  };

  const addElement = (kind: "text" | "rect") => {
    if (elements.length >= MAX_WATERMARK_ELEMENTS) return;
    // 中央付近に少しずつずらして追加 (完全に重なって見失うのを防ぐ)
    const nudge = elements.length * 0.03;
    const el =
      kind === "rect"
        ? createWatermarkRectElement({ offset: { x: nudge, y: nudge } })
        : createWatermarkElement({ offset: { x: nudge, y: nudge } });
    onChange([...elements, el]);
    setSelectedId(el.id);
  };

  const removeSelected = () => {
    if (!selectedId) return;
    const next = elements.filter((el) => el.id !== selectedId);
    onChange(next);
    setSelectedId(next[0]?.id ?? null);
  };

  // プレビュー枠の縦横比: 画像に追従させ、可動範囲でクランプ。
  // 縦写真でもレターボックスが最小になり、モバイルでのドラッグ可能領域が広がる。
  const boxAR = imgAR ? clamp(imgAR, BOX_AR_MIN, BOX_AR_MAX) : BOX_AR_MAX;

  const selectedText = selected ? (selected.autoText ? credit : selected.text) : "";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t`透かしの設定`}
      size="4xl"
      footer={
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            <Trans>完了</Trans>
          </Button>
        </div>
      }
    >
      {/* デスクトップ (md+) はプレビュー左・操作類右の 2 カラム、モバイルは縦積み */}
      <div className="space-y-4 md:flex md:items-start md:gap-6 md:space-y-0">
        <div className="space-y-4 md:sticky md:top-0 md:min-w-0 md:flex-[5]">
          {/* 角丸は付けない: 透かしを角ギリギリに置くエディタなので、写真の四隅が欠けずに見える必要がある */}
          <div
            ref={previewBoxRef}
            className="relative flex items-center justify-center overflow-hidden bg-surface-canvas"
            style={{ aspectRatio: String(boxAR) }}
          >
            {!previewError ? (
              <>
                <canvas
                  ref={canvasRef}
                  role="img"
                  aria-label={t`透かしのプレビュー。要素をドラッグして配置できます`}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className={`h-full w-full touch-none select-none object-contain ${
                    dragActive ? "cursor-grabbing" : "cursor-grab"
                  }`}
                  style={{
                    transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
                    transformOrigin: "0 0",
                  }}
                />
                {previewLoading && (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-surface-canvas/80 text-[13px] text-ink-soft">
                    <LoadingSpinner size="sm" />
                    <span>
                      <Trans>プレビューを読み込み中…</Trans>
                    </span>
                  </div>
                )}
                {previewReady && showDragHint && (
                  <p className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink/60 px-2.5 py-0.5 text-[11px] text-white backdrop-blur-sm">
                    <Trans>ドラッグで配置、ピンチ / ホイールでズーム</Trans>
                  </p>
                )}
              </>
            ) : (
              <p className="px-4 text-center text-[13px] text-ink-soft">
                {previewError === "undecodable" ? (
                  <Trans>この画像はプレビューできません</Trans>
                ) : (
                  <Trans>プレビューできる画像がありません</Trans>
                )}
              </p>
            )}
          </div>

          {candidates.length > 1 && (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {candidates.map((c) => {
                const active = c.id === selectedCandidateId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCandidateId(c.id)}
                    aria-label={t`${c.name} をプレビュー`}
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

          {mixedAspect && (
            <p className="rounded-xl border border-status-warn/30 bg-status-warn/10 px-3 py-2 text-[13px] text-ink">
              <Trans>
                縦横比の違う写真が混ざっています。サムネイルを切り替えて、他の写真での位置も確認してください
              </Trans>
            </p>
          )}
        </div>

        <div className="space-y-4 md:min-w-0 md:flex-[4]">
          {/* 要素の追加はチップ (レイヤー一覧) と分離した見出し行に置く */}
          <div className="flex min-h-8 items-center justify-between gap-2">
            <p className="text-[13px] font-medium text-ink-soft">
              <Trans>要素</Trans>
            </p>
            {elements.length < MAX_WATERMARK_ELEMENTS && (
              <div className="flex gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => addElement("text")}>
                  <Trans>＋ 文字を追加</Trans>
                </Button>
                <Button size="sm" variant="secondary" onClick={() => addElement("rect")}>
                  <Trans>＋ 四角形を追加</Trans>
                </Button>
              </div>
            )}
          </div>
          {/* 要素チップ: 選択 (レイヤー一覧) */}
          <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
            {elements.map((el) => {
              const active = el.id === selectedId;
              const label = ((el.autoText ? credit : el.text).split("\n")[0] || "").trim();
              return (
                <button
                  key={el.id}
                  type="button"
                  onClick={() => setSelectedId(el.id)}
                  aria-pressed={active}
                  className={`h-9 max-w-40 shrink-0 truncate rounded-full border px-3.5 text-[13px] transition-colors ${
                    active
                      ? "border-brand bg-brand-tint text-ink"
                      : "border-surface-sand-deep bg-surface text-ink-soft hover:text-ink"
                  }`}
                  style={
                    el.kind === "text" ? { fontFamily: watermarkFontStack(el.fontId) } : undefined
                  }
                >
                  {el.kind === "rect" ? (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-4 rounded-[3px] bg-current opacity-60" />
                      <Trans>四角形</Trans>
                    </span>
                  ) : (
                    label || (
                      <span className="font-sans text-ink-muted">
                        <Trans>文字を入力</Trans>
                      </span>
                    )
                  )}
                </button>
              );
            })}
          </div>

          {selected ? (
            <div className="space-y-4">
              {selected.kind === "text" && (
                <>
                  <div>
                    <div className="mb-1 flex items-baseline justify-between">
                      <label htmlFor="wmText" className="text-[13px] font-medium text-ink-soft">
                        <Trans>テキスト</Trans>
                      </label>
                      {selected.autoText && (
                        <span className="text-[11px] text-ink-muted">
                          <Trans>送信者名に連動中（編集すると解除）</Trans>
                        </span>
                      )}
                    </div>
                    <textarea
                      id="wmText"
                      rows={2}
                      maxLength={200}
                      value={selectedText}
                      placeholder={
                        selected.autoText
                          ? t`送信者名を入力すると自動で入ります`
                          : t`透かしにする文字`
                      }
                      onChange={(e) => updateSelected({ text: e.target.value, autoText: false })}
                      className="block w-full resize-y rounded-xl border border-surface-sand-deep bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-ink-muted transition-all focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15"
                      style={{ fontFamily: watermarkFontStack(selected.fontId) }}
                    />
                    {selected.autoText && !credit && (
                      <p className="mt-1.5 rounded-xl border border-status-warn/30 bg-status-warn/10 px-3 py-2 text-[13px] text-ink">
                        <Trans>送信者名が未入力です。このテキストには送信者名が使われます</Trans>
                      </p>
                    )}
                  </div>

                  <details
                    className="group rounded-xl border border-surface-sand-deep bg-surface-canvas/40"
                    onToggle={(e) => {
                      if (e.currentTarget.open) preloadWatermarkFontLabels();
                    }}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:bg-surface-sand">
                      <span className="flex items-baseline gap-2">
                        <Trans>フォント</Trans>
                        <span
                          className="text-[15px] text-ink"
                          style={{ fontFamily: watermarkFontStack(selected.fontId) }}
                        >
                          {i18n._(getWatermarkFont(selected.fontId).label)}
                        </span>
                      </span>
                      <ChevronIcon />
                    </summary>
                    <div className="max-h-56 space-y-3 overflow-y-auto px-3 pb-3 pt-1">
                      {FONTS_BY_CATEGORY.map((cat) => (
                        <div key={cat.id}>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                            {i18n._(cat.label)}
                          </p>
                          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                            {cat.fonts.map((f) => {
                              const active = selected.fontId === f.id;
                              return (
                                <button
                                  key={f.id}
                                  type="button"
                                  onClick={() => updateSelected({ fontId: f.id })}
                                  aria-pressed={active}
                                  className={`flex h-10 items-center justify-center rounded-lg border px-2 text-[15px] leading-none transition-colors ${
                                    active
                                      ? "border-brand bg-brand-tint text-ink"
                                      : "border-transparent bg-surface text-ink-soft hover:text-ink"
                                  }`}
                                  style={{ fontFamily: watermarkFontStack(f.id) }}
                                >
                                  {i18n._(f.label)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {selected.kind === "text" ? (
                  <SliderField
                    id="wmSize"
                    label={t`サイズ (${(selected.fontSizeRatio * 100).toFixed(1)}%)`}
                    range={WATERMARK_RANGES.fontSizeRatio}
                    value={selected.fontSizeRatio}
                    onChange={(v) => updateSelected({ fontSizeRatio: v })}
                  />
                ) : (
                  <>
                    <SliderField
                      id="wmRectW"
                      label={t`幅 (長辺の${Math.round(selected.rectW * 100)}%)`}
                      range={WATERMARK_RANGES.rectW}
                      value={selected.rectW}
                      onChange={(v) => updateSelected({ rectW: v })}
                    />
                    <SliderField
                      id="wmRectH"
                      label={t`高さ (長辺の${Math.round(selected.rectH * 100)}%)`}
                      range={WATERMARK_RANGES.rectH}
                      value={selected.rectH}
                      onChange={(v) => updateSelected({ rectH: v })}
                    />
                    <SliderField
                      id="wmRectR"
                      label={t`角丸 (${Math.round(selected.rectRadius * 200)}%)`}
                      range={WATERMARK_RANGES.rectRadius}
                      value={selected.rectRadius}
                      onChange={(v) => updateSelected({ rectRadius: v })}
                    />
                  </>
                )}
                <SliderField
                  id="wmOpacity"
                  label={t`透明度 (${Math.round(selected.opacity * 100)}%)`}
                  range={WATERMARK_RANGES.opacity}
                  value={selected.opacity}
                  onChange={(v) => updateSelected({ opacity: v })}
                />
              </div>

              <div>
                <p className="mb-1.5 block text-[13px] font-medium text-ink-soft">
                  <Trans>色</Trans>
                  <span className="ml-1.5 font-normal text-ink-muted">
                    <Trans>（背景の明るさで明暗が自動調整されます）</Trans>
                  </span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {WATERMARK_PALETTES.map((p) => {
                    const active = selected.color === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => updateSelected({ color: p.id })}
                        aria-label={i18n._(p.label)}
                        aria-pressed={active}
                        title={i18n._(p.label)}
                        className={`h-8 w-8 rounded-full border-2 transition-transform ${
                          active ? "scale-110 border-brand" : "border-surface-sand-deep"
                        }`}
                        style={{
                          background: `linear-gradient(135deg, ${p.light} 50%, ${p.dark} 50%)`,
                        }}
                      />
                    );
                  })}
                  <label
                    title={t`カスタム色（明暗の自動調整なし・固定色）`}
                    className={`h-8 w-8 cursor-pointer rounded-full border-2 transition-transform ${
                      isCustomWatermarkColor(selected.color)
                        ? "scale-110 border-brand"
                        : "border-surface-sand-deep"
                    }`}
                    style={{
                      background: isCustomWatermarkColor(selected.color)
                        ? selected.color
                        : "conic-gradient(#f43f3f, #f4b63f, #7ec44a, #3fb8f4, #7a3ff4, #f43fb0, #f43f3f)",
                    }}
                  >
                    <input
                      type="color"
                      aria-label={t`カスタム色`}
                      value={isCustomWatermarkColor(selected.color) ? selected.color : "#ff6b4a"}
                      onChange={(e) => updateSelected({ color: e.target.value })}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                {selected.kind === "text" ? (
                  <label className="flex items-center gap-2 text-[13px] font-medium text-ink-soft">
                    <input
                      type="checkbox"
                      checked={selected.stroke}
                      onChange={(e) => updateSelected({ stroke: e.target.checked })}
                      className="h-4 w-4 accent-brand"
                    />
                    <span>
                      <Trans>縁取り（アウトラインで視認性UP）</Trans>
                    </span>
                  </label>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={removeSelected}
                  className="rounded-lg px-2.5 py-1.5 text-[13px] text-status-danger transition-colors hover:bg-status-danger-tint"
                >
                  <Trans>この要素を削除</Trans>
                </button>
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-surface-sand px-3 py-2.5 text-center text-[13px] text-ink-soft">
              {elements.length > 0 ? (
                <Trans>プレビューの要素かチップをタップすると編集できます</Trans>
              ) : (
                <Trans>「＋ 文字を追加」「＋ 四角形を追加」から透かしの要素を追加できます</Trans>
              )}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function SliderField({
  id,
  label,
  range,
  value,
  onChange,
}: {
  id: string;
  label: string;
  range: { min: number; max: number; step: number };
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-medium text-ink-soft">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
        className="w-full accent-brand"
      />
    </div>
  );
}

/** 選択中要素の周りに破線の選択枠を描く (プレビュー専用、焼き込みには乗らない) */
function drawSelectionOutline(ctx: CanvasRenderingContext2D, layout: WatermarkElementLayout): void {
  const pad = Math.max(6, layout.fontSize * 0.2);
  ctx.save();
  ctx.strokeStyle = "#D96A4A";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 5]);
  ctx.globalAlpha = 0.9;
  ctx.strokeRect(
    layout.left - pad,
    layout.top - pad,
    layout.width + pad * 2,
    layout.height + pad * 2,
  );
  ctx.restore();
}

/** 開閉状態は summary のテキストで伝わるため、アイコンは読み上げ対象から外す */
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
      aria-hidden="true"
      className="text-ink-muted transition-transform group-open:rotate-180"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
