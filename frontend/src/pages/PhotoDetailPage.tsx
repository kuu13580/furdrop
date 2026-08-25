import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import DownloadOptionsDialog, { DownloadOptionsTrigger } from "../components/DownloadOptionsDialog";
import Alert from "../components/ui/Alert";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import { useDownloadOptions } from "../hooks/useDownloadOptions";
import { onImageError } from "../lib/analytics";
import { receiverApi } from "../lib/api";
import { type ExifCreditMode, embedExifCredit } from "../lib/exif-credit";
import { formatBytes, formatDate, formatDateTime } from "../lib/format";
import { BANNER_DAYS, daysUntilExpiry } from "../lib/retention";
import type { Photo } from "../types/photo";

export default function PhotoDetailPage() {
  const { t, i18n } = useLingui();
  const { photoId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as {
    photo?: Photo;
    groupMode?: "none" | "date" | "sender";
  } | null;
  const initialPhoto = locationState?.photo ?? null;
  const groupMode = locationState?.groupMode ?? "none";
  const [photo, setPhoto] = useState<Photo | null>(initialPhoto);
  const [prevId, setPrevId] = useState<string | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialPhoto);
  const [viewLoaded, setViewLoaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [creditFailed, setCreditFailed] = useState(false);
  const downloadOptions = useDownloadOptions();

  // photoId 変更時: view_url・prev/next を取得
  useEffect(() => {
    if (!photoId) return;
    let cancelled = false;
    // photoId 変更で表示写真とneighborsをリセット
    setViewLoaded(false);
    setCreditFailed(false);
    setPrevId(null);
    setNextId(null);
    receiverApi
      .getPhoto(photoId, groupMode)
      .then(({ photo: p, prev_id, next_id }) => {
        if (cancelled) return;
        setPhoto(p);
        setPrevId(prev_id);
        setNextId(next_id);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [photoId, groupMode]);

  const goPrev = useCallback(() => {
    if (prevId) navigate(`/gallery/${prevId}`, { replace: true, state: { groupMode } });
  }, [prevId, navigate, groupMode]);

  const goNext = useCallback(() => {
    if (nextId) navigate(`/gallery/${nextId}`, { replace: true, state: { groupMode } });
  }, [nextId, navigate, groupMode]);

  // 矢印キーで前後移動
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext]);

  const runDownload = useCallback(
    async (mode: ExifCreditMode) => {
      if (!photoId) return;
      setDownloading(true);
      setCreditFailed(false);
      try {
        const { download_url, filename, sender_name } = await receiverApi.downloadPhoto(photoId);
        const name = filename ?? `${photoId}.jpg`;

        // 記録しないときは R2 への直リンクのまま。fetch もメモリも使わない最速パスを保つ
        if (mode === "none") {
          triggerDownload(download_url, name);
          return;
        }

        let blob: Blob;
        try {
          const res = await fetch(download_url);
          if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
          blob = await embedExifCredit(await res.blob(), sender_name, mode);
        } catch {
          // 記録に失敗しても DL は成立させる (直リンクで無加工のまま保存)
          setCreditFailed(true);
          triggerDownload(download_url, name);
          return;
        }

        const objectUrl = URL.createObjectURL(blob);
        triggerDownload(objectUrl, name);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } catch {
        // エラー時は何もしない
      } finally {
        setDownloading(false);
      }
    },
    [photoId],
  );

  // 初回 DL のときだけ EXIF 記録の確認ダイアログを挟む (R17)
  const handleDownload = useCallback(() => {
    downloadOptions.startDownload((mode) => {
      void runDownload(mode);
    });
  }, [downloadOptions, runDownload]);

  const handleDelete = useCallback(async () => {
    if (!photoId) return;
    setDeleting(true);
    try {
      await receiverApi.deletePhoto(photoId);
      navigate("/gallery", { replace: true });
    } catch {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  }, [photoId, navigate]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!photo) {
    return (
      <div className="py-16 text-center">
        <p className="text-[14px] text-ink-soft">
          <Trans>写真が見つかりません</Trans>
        </p>
        <Button variant="ghost" onClick={() => navigate("/gallery")} className="mt-4">
          <Trans>ギャラリーに戻る</Trans>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate("/gallery")}
            className="rounded-lg px-2 py-1 text-[14px] text-ink-soft transition-colors hover:bg-surface-sand hover:text-ink"
          >
            <Trans>&larr; ギャラリー</Trans>
          </button>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="whitespace-nowrap"
              onClick={handleDownload}
              loading={downloading}
            >
              <Trans>ダウンロード</Trans>
            </Button>
            <Button
              size="sm"
              variant="danger"
              className="whitespace-nowrap"
              onClick={() => setDeleteConfirmOpen(true)}
              loading={deleting}
            >
              <Trans>削除</Trans>
            </Button>
          </div>
        </div>
        {/* DL 設定は行を分ける (モバイルで操作ボタンと同居させると折り返して潰れる) */}
        <div className="-mr-2 flex justify-end">
          <DownloadOptionsTrigger onClick={downloadOptions.openEditor} />
        </div>
      </div>

      {creditFailed && (
        <Alert variant="info">
          <Trans>撮影者名を記録できませんでした。写真はそのまま保存されています。</Trans>
        </Alert>
      )}

      {/* オリジナル表示（縦横比固定でガタつき防止。ロード中はサムネイル）
          width = min(100%, 縦辺上限 × ratio) により
          縦辺が画面縦の70%を超えず、アスペクト比も必ず保持される */}
      <div className="relative flex justify-center">
        {photo.view_url || photo.thumb_url ? (
          (() => {
            const ratioNum = photo.width && photo.height ? photo.width / photo.height : 4 / 3;
            const aspectRatio =
              photo.width && photo.height ? `${photo.width} / ${photo.height}` : "4 / 3";
            return (
              <div
                className="relative mx-auto overflow-hidden rounded-2xl bg-surface-canvas"
                style={{
                  aspectRatio,
                  width: `min(100%, calc(70dvh * ${ratioNum}))`,
                }}
              >
                {photo.thumb_url && (
                  <img
                    src={photo.thumb_url}
                    alt=""
                    aria-hidden="true"
                    onError={onImageError("photo-detail-thumb", "thumb")}
                    className={`absolute inset-0 h-full w-full object-contain blur-md transition-opacity duration-300 ${
                      viewLoaded ? "opacity-0" : "opacity-100"
                    }`}
                  />
                )}
                {photo.view_url && (
                  <img
                    src={photo.view_url}
                    alt={photo.sender_name ?? t`写真`}
                    onLoad={() => setViewLoaded(true)}
                    onError={onImageError("photo-detail-view", "original")}
                    className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
                      viewLoaded ? "opacity-100" : "opacity-0"
                    }`}
                  />
                )}
              </div>
            );
          })()
        ) : (
          <div className="flex h-64 w-full items-center justify-center rounded-2xl bg-surface-sand text-[14px] text-ink-muted">
            <Trans>画像を読み込めません</Trans>
          </div>
        )}

        {prevId && (
          <button
            type="button"
            onClick={goPrev}
            aria-label={t`前の写真`}
            className="absolute top-1/2 left-2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-ink shadow-card transition-colors hover:bg-surface sm:left-4"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              role="img"
              aria-label={t`前へ`}
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        {nextId && (
          <button
            type="button"
            onClick={goNext}
            aria-label={t`次の写真`}
            className="absolute top-1/2 right-2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-ink shadow-card transition-colors hover:bg-surface sm:right-4"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              role="img"
              aria-label={t`次へ`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>

      {/* メタデータ */}
      <Card title={t`写真情報`}>
        <dl className="space-y-2 text-[14px]">
          {photo.sender_name && (
            <div className="flex justify-between">
              <dt className="text-ink-soft">
                <Trans>送信者</Trans>
              </dt>
              <dd className="font-medium text-ink">{photo.sender_name}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-ink-soft">
              <Trans>サイズ</Trans>
            </dt>
            <dd className="font-mono text-ink">{formatBytes(photo.file_size)}</dd>
          </div>
          {photo.width && photo.height && (
            <div className="flex justify-between">
              <dt className="text-ink-soft">
                <Trans>解像度</Trans>
              </dt>
              <dd className="font-mono text-ink">
                {photo.width} &times; {photo.height}
              </dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-ink-soft">
              <Trans>受信日</Trans>
            </dt>
            <dd className="font-mono text-ink">{formatDateTime(photo.created_at, i18n.locale)}</dd>
          </div>
          {/* 削除予定日は常時表示。期限が近いものだけ警告色にして目に留める */}
          {(() => {
            const remainingDays = daysUntilExpiry(photo.expires_at);
            const near = remainingDays <= BANNER_DAYS;
            return (
              <div className="flex justify-between">
                <dt className="text-ink-soft">
                  <Trans>削除予定日</Trans>
                </dt>
                {/* Amber を文字色に使うと白背景で 2.65:1 にしかならない (AA は 4.5:1)。
                    警告は tint 背景 + 太字 + 残日数で示し、文字は Ink のままにする */}
                <dd
                  className={
                    near
                      ? "rounded bg-status-warn-tint px-1.5 py-0.5 font-mono font-semibold text-ink"
                      : "font-mono text-ink"
                  }
                >
                  {formatDate(photo.expires_at, i18n.locale)}
                  {near && (
                    <span className="ml-1">
                      {remainingDays > 0 ? (
                        <Plural value={remainingDays} other="(あと#日)" />
                      ) : (
                        <Trans>(まもなく)</Trans>
                      )}
                    </span>
                  )}
                </dd>
              </div>
            );
          })()}
        </dl>
      </Card>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title={t`この写真を削除しますか？`}
        description={t`削除された写真は復元できません。`}
        confirmLabel={t`削除する`}
        variant="danger"
        loading={deleting}
      />

      <DownloadOptionsDialog {...downloadOptions.dialogProps} />
    </div>
  );
}

/** a[download] で DL を発火する。href は presigned URL でも objectURL でもよい */
function triggerDownload(href: string, name: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
