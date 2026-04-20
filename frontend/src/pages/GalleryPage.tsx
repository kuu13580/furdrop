import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import Button from "../components/ui/Button";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import { receiverApi } from "../lib/api";
import type { Photo } from "../types/photo";

const PAGE_SIZE = 50;

export default function GalleryPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  // Shift+クリック & ドラッグ選択用
  const lastClickedRef = useRef<number | null>(null);
  const dragStartIndexRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  // ドラッグで選択 or 解除かを判定
  const dragModeRef = useRef<"select" | "deselect">("select");
  // ドラッグ開始時点の選択状態を保持
  const preSelectRef = useRef<Set<string>>(new Set());
  // ドラッグ後のクリック抑制（実際に移動が発生した場合のみ）
  const suppressClickRef = useRef(false);
  const didMoveRef = useRef(false);

  const fetchPhotos = useCallback(async (nextCursor?: string) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const res = await receiverApi.listPhotos({
        limit: PAGE_SIZE,
        cursor: nextCursor,
      });
      setPhotos((prev) => (nextCursor ? [...prev, ...res.photos] : res.photos));
      setCursor(res.next_cursor);
      setHasMore(res.next_cursor !== null);
    } catch {
      // エラー時はそのまま
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  useEffect(() => {
    if (!hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && cursor && !loadingRef.current) {
          fetchPhotos(cursor);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, hasMore, fetchPhotos]);

  /** data-photo-index 属性からインデックスを取得 */
  const getIndexFromPoint = useCallback((x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const item = (el as HTMLElement).closest("[data-photo-index]") as HTMLElement | null;
    if (!item) return null;
    const idx = Number.parseInt(item.dataset.photoIndex ?? "", 10);
    return Number.isNaN(idx) ? null : idx;
  }, []);

  /** start〜end 間のIDを全て含む Set を返す */
  const rangeIds = useCallback(
    (start: number, end: number): Set<string> => {
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      const ids = new Set<string>();
      for (let i = lo; i <= hi; i++) ids.add(photos[i].id);
      return ids;
    },
    [photos],
  );

  // --- クリック ---
  const handleSelect = useCallback(
    (index: number, e: React.MouseEvent) => {
      // ドラッグ直後はクリックを無視
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      if (e.shiftKey && lastClickedRef.current !== null) {
        const last = lastClickedRef.current;
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of rangeIds(last, index)) next.add(id);
          return next;
        });
      } else {
        setSelected((prev) => {
          const next = new Set(prev);
          const id = photos[index].id;
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }
      lastClickedRef.current = index;
    },
    [photos, rangeIds],
  );

  // --- ドラッグ選択 (iPhone 式: 開始〜現在位置をグリッド順に全選択/解除) ---
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!selectMode) return;
      const idx = getIndexFromPoint(e.clientX, e.clientY);
      if (idx === null) return;
      isDraggingRef.current = true;
      didMoveRef.current = false;
      dragStartIndexRef.current = idx;
      preSelectRef.current = new Set(selected);
      // 開始地点が選択済み → 解除モード、未選択 → 選択モード
      dragModeRef.current = selected.has(photos[idx].id) ? "deselect" : "select";
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [selectMode, selected, photos, getIndexFromPoint],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current || dragStartIndexRef.current === null) return;
      const idx = getIndexFromPoint(e.clientX, e.clientY);
      if (idx === null) return;
      didMoveRef.current = true;
      const drag = rangeIds(dragStartIndexRef.current, idx);
      const next = new Set(preSelectRef.current);
      if (dragModeRef.current === "select") {
        for (const id of drag) next.add(id);
      } else {
        for (const id of drag) next.delete(id);
      }
      setSelected(next);
    },
    [getIndexFromPoint, rangeIds],
  );

  const handlePointerUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      dragStartIndexRef.current = null;
      // 実際に移動が発生した場合のみ click を抑制
      if (didMoveRef.current) {
        suppressClickRef.current = true;
      }
      didMoveRef.current = false;
    }
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === photos.length ? new Set() : new Set(photos.map((p) => p.id)),
    );
  }, [photos]);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
    lastClickedRef.current = null;
  }, []);

  const handleBatchDelete = useCallback(async () => {
    if (selected.size === 0) return;
    if (!confirm(`${selected.size}枚の写真を削除しますか？`)) return;
    setDeleting(true);
    try {
      await receiverApi.batchDeletePhotos([...selected]);
      setPhotos((prev) => prev.filter((p) => !selected.has(p.id)));
      exitSelectMode();
    } catch {
      // エラー時はそのまま
    } finally {
      setDeleting(false);
    }
  }, [selected, exitSelectMode]);

  const handleBatchDownload = useCallback(async () => {
    for (const id of selected) {
      try {
        const { download_url, filename } = await receiverApi.downloadPhoto(id);
        const a = document.createElement("a");
        a.href = download_url;
        a.download = filename ?? `${id}.jpg`;
        a.click();
      } catch {
        // 個別失敗は無視
      }
    }
  }, [selected]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold tracking-[-0.015em] text-ink">ギャラリー</h1>
        {photos.length > 0 && (
          <button
            type="button"
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            className="rounded-lg px-3 py-1.5 text-[14px] font-medium text-brand transition-colors hover:bg-brand-tint"
          >
            {selectMode ? "完了" : "選択"}
          </button>
        )}
      </div>

      {selectMode && (
        <div className="flex items-center justify-between rounded-2xl border border-surface-sand-deep bg-surface-sand px-4 py-2.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-[14px] font-medium text-brand transition-colors hover:text-brand-deep"
            >
              {selected.size === photos.length ? "全解除" : "全選択"}
            </button>
            <span className="text-[14px] text-ink-soft">{selected.size}枚選択中</span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleBatchDownload}
              disabled={selected.size === 0}
            >
              DL
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={handleBatchDelete}
              disabled={selected.size === 0}
              loading={deleting}
            >
              削除
            </Button>
          </div>
        </div>
      )}

      {photos.length === 0 ? (
        <div className="rounded-2xl bg-surface-sand py-16 text-center">
          <p className="text-[14px] font-medium text-ink-soft">まだ写真がありません</p>
        </div>
      ) : (
        <div
          className="grid select-none grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {photos.map((photo, index) => {
            const isSelected = selected.has(photo.id);
            const thumb = photo.thumb_url ? (
              <img
                src={photo.thumb_url}
                alt={photo.sender_name ?? "写真"}
                className="max-h-full max-w-full rounded-xl object-contain"
                loading="lazy"
                draggable={false}
              />
            ) : (
              <span className="text-2xl text-ink-muted">📷</span>
            );

            return (
              <div key={photo.id} data-photo-index={index} className="relative touch-none">
                {selectMode ? (
                  <button
                    type="button"
                    onClick={(e) => handleSelect(index, e)}
                    className={`flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl bg-surface-canvas outline-none transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
                      isSelected ? "ring-2 ring-brand" : ""
                    }`}
                  >
                    {thumb}
                    <div
                      className={`absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
                        isSelected
                          ? "border-brand bg-brand text-white"
                          : "border-white bg-ink/25 text-white"
                      }`}
                    >
                      {isSelected && (
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                          role="img"
                          aria-label="選択済み"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                ) : (
                  <Link
                    to={`/gallery/${photo.id}`}
                    state={{ photo }}
                    className="group flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-surface-canvas transition-transform hover:scale-[1.02]"
                  >
                    {thumb}
                    {photo.sender_name && (
                      <span className="absolute inset-x-0 bottom-0 truncate rounded-b-2xl bg-ink/55 px-2 py-1 text-[12px] text-white backdrop-blur-sm">
                        {photo.sender_name}
                      </span>
                    )}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          <LoadingSpinner />
        </div>
      )}
    </div>
  );
}
