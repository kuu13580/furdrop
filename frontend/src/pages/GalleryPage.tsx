import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import BatchDownloadModal from "../components/BatchDownloadModal";
import Button from "../components/ui/Button";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import { receiverApi } from "../lib/api";
import { buildZipName, downloadAsZip } from "../lib/zip-download";
import { userAtom } from "../stores/user";
import type { Photo } from "../types/photo";

const PAGE_SIZE = 50;

type GroupMode = "none" | "date" | "sender";

type PhotoGroup = {
  key: string;
  label: string | null;
  items: { photo: Photo; index: number }[];
};

function buildGroups(photos: Photo[], mode: GroupMode): PhotoGroup[] {
  if (mode === "none") {
    return [{ key: "all", label: null, items: photos.map((photo, index) => ({ photo, index })) }];
  }
  const map = new Map<string, PhotoGroup>();
  photos.forEach((photo, index) => {
    let key: string;
    let label: string;
    if (mode === "date") {
      const d = new Date(photo.created_at * 1000);
      key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      label = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
    } else {
      key = photo.sender_name ?? "__anonymous__";
      label = photo.sender_name ?? "(匿名)";
    }
    const existing = map.get(key);
    if (existing) existing.items.push({ photo, index });
    else map.set(key, { key, label, items: [{ photo, index }] });
  });
  return [...map.values()];
}

export default function GalleryPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>("none");
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const user = useAtomValue(userAtom);

  // 一括 ZIP DL 用ステート
  const [zipState, setZipState] = useState<{
    processed: number;
    total: number;
    failed: number;
  } | null>(null);
  const zipControllerRef = useRef<AbortController | null>(null);

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
    if (loadingRef.current) return null;
    loadingRef.current = true;
    try {
      const res = await receiverApi.listPhotos({
        limit: PAGE_SIZE,
        cursor: nextCursor,
      });
      setPhotos((prev) => (nextCursor ? [...prev, ...res.photos] : res.photos));
      setCursor(res.next_cursor);
      setHasMore(res.next_cursor !== null);
      return res;
    } catch {
      return null;
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
    setDeleting(true);
    try {
      await receiverApi.batchDeletePhotos([...selected]);
      setPhotos((prev) => prev.filter((p) => !selected.has(p.id)));
      exitSelectMode();
    } catch {
      // エラー時はそのまま
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  }, [selected, exitSelectMode]);

  const groups = useMemo(() => buildGroups(photos, groupMode), [photos, groupMode]);

  const [groupLoadingKey, setGroupLoadingKey] = useState<string | null>(null);

  const toggleGroupSelection = useCallback(
    async (group: PhotoGroup) => {
      const currentIds = group.items.map((it) => it.photo.id);
      const currentAllSelected =
        currentIds.length > 0 && currentIds.every((id) => selected.has(id));
      const mode = groupMode;
      const targetKey = group.key;

      // ---------- sender モード: 専用エンドポイントで全IDを取得 ----------
      if (mode === "sender") {
        setGroupLoadingKey(targetKey);
        try {
          const senderParam =
            group.items[0]?.photo.sender_name ?? (targetKey === "__anonymous__" ? "" : targetKey);
          const { photo_ids } = await receiverApi.listPhotoIdsBySender(senderParam);
          setSelected((prev) => {
            const next = new Set(prev);
            if (currentAllSelected) {
              for (const id of photo_ids) next.delete(id);
            } else {
              for (const id of photo_ids) next.add(id);
            }
            return next;
          });
          if (!currentAllSelected) setSelectMode(true);
        } finally {
          setGroupLoadingKey(null);
        }
        return;
      }

      // ---------- date モード: 既ロード分で足りなければ早期終了式にチェーンロード ----------
      // 全選択状態なら解除 (ロード不要)
      if (currentAllSelected) {
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of currentIds) next.delete(id);
          return next;
        });
        return;
      }

      setSelectMode(true);
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of currentIds) next.add(id);
        return next;
      });

      if (!hasMore || !cursor) return;

      const keyOf = (p: Photo): string => {
        const d = new Date(p.created_at * 1000);
        return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      };

      setGroupLoadingKey(targetKey);
      try {
        let curCursor: string | null = cursor;
        let curHasMore = true;
        while (curHasMore && curCursor) {
          const res = await fetchPhotos(curCursor);
          if (!res) break;
          curCursor = res.next_cursor;
          curHasMore = res.next_cursor !== null;

          const addIds: string[] = [];
          let passedGroup = false;
          for (const p of res.photos) {
            if (keyOf(p) === targetKey) {
              addIds.push(p.id);
            } else {
              // date は created_at DESC ソートなので別日付が出たら以降はすべて別グループ
              passedGroup = true;
            }
          }
          if (addIds.length > 0) {
            setSelected((prev) => {
              const next = new Set(prev);
              for (const id of addIds) next.add(id);
              return next;
            });
          }
          if (passedGroup) break;
        }
      } finally {
        setGroupLoadingKey(null);
      }
    },
    [groupMode, cursor, hasMore, selected, fetchPhotos],
  );

  const handleBatchDownload = useCallback(async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (zipControllerRef.current) return;

    const controller = new AbortController();
    zipControllerRef.current = controller;
    setZipState({ processed: 0, total: ids.length, failed: 0 });

    try {
      await downloadAsZip({
        photoIds: ids,
        zipName: buildZipName(user?.handle ?? "photos"),
        signal: controller.signal,
        onProgress: (p) => setZipState(p),
      });
    } catch {
      // 中断・致命エラーはモーダルを閉じるだけ
    } finally {
      zipControllerRef.current = null;
      setZipState(null);
    }
  }, [selected, user?.handle]);

  const cancelBatchDownload = useCallback(() => {
    zipControllerRef.current?.abort();
  }, []);

  // ZIP 生成中はページ離脱を抑止
  useEffect(() => {
    if (!zipState) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [zipState]);

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
        <h1 className="text-[22px] font-bold tracking-[-0.015em] text-ink sm:text-[28px]">
          ギャラリー
        </h1>
        {photos.length > 0 && (
          <button
            type="button"
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            className="rounded-lg px-3 py-1.5 text-[14px] font-medium text-brand transition-colors hover:bg-brand-tint"
          >
            {selectMode ? "完了" : "選択/DL"}
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
              disabled={selected.size === 0 || zipState !== null}
              loading={zipState !== null}
            >
              DL
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={selected.size === 0}
              loading={deleting}
            >
              削除
            </Button>
          </div>
        </div>
      )}

      {photos.length > 0 && (
        <div className="flex gap-1 rounded-xl bg-surface-sand p-1 text-[13px] font-medium">
          {(
            [
              ["none", "新着順"],
              ["date", "日付別"],
              ["sender", "撮影者別"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setGroupMode(mode)}
              className={`flex-1 rounded-lg px-3 py-1.5 transition-colors ${
                groupMode === mode
                  ? "bg-surface text-ink shadow-card"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {photos.length === 0 ? (
        <div className="rounded-2xl bg-surface-sand py-16 text-center">
          <p className="text-[14px] font-medium text-ink-soft">まだ写真がありません</p>
        </div>
      ) : (
        <div
          className="space-y-6"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {groups.map((group) => {
            const groupIds = group.items.map((it) => it.photo.id);
            const allGroupSelected =
              groupIds.length > 0 && groupIds.every((id) => selected.has(id));
            return (
              <section key={group.key} className="space-y-3">
                {group.label && (
                  <div className="flex items-center justify-between">
                    <h2 className="text-[14px] font-semibold text-ink-soft">
                      {group.label}
                      <span className="ml-2 text-ink-muted">({group.items.length})</span>
                    </h2>
                    <button
                      type="button"
                      onClick={() => toggleGroupSelection(group)}
                      disabled={groupLoadingKey === group.key}
                      className="rounded-lg px-2.5 py-1 text-[13px] font-medium text-brand transition-colors hover:bg-brand-tint disabled:cursor-progress disabled:opacity-60"
                    >
                      {groupLoadingKey === group.key
                        ? "読み込み中..."
                        : allGroupSelected
                          ? "グループ解除"
                          : "グループ選択"}
                    </button>
                  </div>
                )}
                <div className="grid select-none grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
                  {group.items.map(({ photo, index }) => {
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
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              )}
                            </div>
                          </button>
                        ) : (
                          <Link
                            to={`/gallery/${photo.id}`}
                            state={{ photo, groupMode }}
                            className="group flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-surface-canvas transition-transform hover:scale-[1.02]"
                          >
                            {thumb}
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          <LoadingSpinner />
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleBatchDelete}
        title={`${selected.size}枚の写真を削除しますか？`}
        description="削除された写真は復元できません。"
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        variant="danger"
        loading={deleting}
      />

      <BatchDownloadModal
        open={zipState !== null}
        processed={zipState?.processed ?? 0}
        total={zipState?.total ?? 0}
        failed={zipState?.failed ?? 0}
        onCancel={cancelBatchDownload}
      />
    </div>
  );
}
