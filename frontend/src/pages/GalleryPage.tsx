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
        <h1 className="text-2xl font-bold">ギャラリー</h1>
        {photos.length > 0 && (
          <button
            type="button"
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            className="text-sm text-blue-600 hover:underline"
          >
            {selectMode ? "完了" : "選択"}
          </button>
        )}
      </div>

      {selectMode && (
        <div className="flex items-center justify-between rounded-lg bg-gray-100 px-4 py-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-sm text-blue-600 hover:underline"
            >
              {selected.size === photos.length ? "全解除" : "全選択"}
            </button>
            <span className="text-sm text-gray-500">{selected.size}枚選択中</span>
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
        <p className="py-16 text-center text-gray-400">まだ写真がありません</p>
      ) : (
        <div
          className="grid grid-cols-2 gap-2 select-none sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {photos.map((photo, index) => (
            <div key={photo.id} data-photo-index={index} className="relative touch-none">
              {selectMode ? (
                <button
                  type="button"
                  onClick={(e) => handleSelect(index, e)}
                  className={`aspect-square w-full overflow-hidden rounded-lg bg-gray-100 outline-none transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-400 ${
                    selected.has(photo.id) ? "ring-2 ring-blue-500" : ""
                  }`}
                >
                  {photo.thumb_url ? (
                    <img
                      src={photo.thumb_url}
                      alt={photo.sender_name ?? "写真"}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-300">
                      <span className="text-2xl">📷</span>
                    </div>
                  )}
                  <div
                    className={`absolute top-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                      selected.has(photo.id)
                        ? "border-blue-500 bg-blue-500 text-white"
                        : "border-white bg-black/20"
                    }`}
                  >
                    {selected.has(photo.id) && (
                      <svg
                        className="h-3 w-3"
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
                  className="group block aspect-square overflow-hidden rounded-lg bg-gray-100"
                >
                  {photo.thumb_url ? (
                    <img
                      src={photo.thumb_url}
                      alt={photo.sender_name ?? "写真"}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-300">
                      <span className="text-2xl">📷</span>
                    </div>
                  )}
                  {photo.sender_name && (
                    <span className="absolute bottom-0 left-0 w-full truncate bg-black/40 px-1.5 py-0.5 text-xs text-white">
                      {photo.sender_name}
                    </span>
                  )}
                </Link>
              )}
            </div>
          ))}
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
