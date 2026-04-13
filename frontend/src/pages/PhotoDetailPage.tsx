import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import { receiverApi } from "../lib/api";
import { formatBytes } from "../lib/format";
import type { Photo } from "../types/photo";

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PhotoDetailPage() {
  const { photoId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [photo, setPhoto] = useState<Photo | null>(
    (location.state as { photo?: Photo })?.photo ?? null,
  );
  const [loading, setLoading] = useState(!photo);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Route state がない場合（直接URL）はAPIから取得
  useEffect(() => {
    if (photo || !photoId) return;
    let cancelled = false;
    receiverApi
      .getPhoto(photoId)
      .then(({ photo: p }) => {
        if (!cancelled) setPhoto(p);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [photo, photoId]);

  const handleDownload = useCallback(async () => {
    if (!photoId) return;
    setDownloading(true);
    try {
      const { download_url, filename } = await receiverApi.downloadPhoto(photoId);
      const a = document.createElement("a");
      a.href = download_url;
      a.download = filename ?? `${photoId}.jpg`;
      a.click();
    } catch {
      // エラー時は何もしない
    } finally {
      setDownloading(false);
    }
  }, [photoId]);

  const handleDelete = useCallback(async () => {
    if (!photoId) return;
    if (!confirm("この写真を削除しますか？")) return;
    setDeleting(true);
    try {
      await receiverApi.deletePhoto(photoId);
      navigate("/gallery", { replace: true });
    } catch {
      setDeleting(false);
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
        <p className="text-gray-500">写真が見つかりません</p>
        <Button variant="ghost" onClick={() => navigate("/gallery")} className="mt-4">
          ギャラリーに戻る
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate("/gallery")}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; ギャラリー
        </button>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={handleDownload} loading={downloading}>
            ダウンロード
          </Button>
          <Button size="sm" variant="danger" onClick={handleDelete} loading={deleting}>
            削除
          </Button>
        </div>
      </div>

      {/* サムネイル拡大 */}
      <div className="flex justify-center">
        {photo.thumb_url ? (
          <img
            src={photo.thumb_url}
            alt={photo.sender_name ?? "写真"}
            className="max-h-[60vh] rounded-lg object-contain"
          />
        ) : (
          <div className="flex h-64 w-full items-center justify-center rounded-lg bg-gray-100 text-gray-300">
            画像を読み込めません
          </div>
        )}
      </div>

      {/* メタデータ */}
      <Card title="写真情報">
        <dl className="space-y-2 text-sm">
          {photo.sender_name && (
            <div className="flex justify-between">
              <dt className="text-gray-500">送信者</dt>
              <dd className="font-medium">{photo.sender_name}</dd>
            </div>
          )}
          {photo.original_filename && (
            <div className="flex justify-between">
              <dt className="text-gray-500">ファイル名</dt>
              <dd className="font-medium">{photo.original_filename}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-gray-500">サイズ</dt>
            <dd className="font-medium">{formatBytes(photo.file_size)}</dd>
          </div>
          {photo.width && photo.height && (
            <div className="flex justify-between">
              <dt className="text-gray-500">解像度</dt>
              <dd className="font-medium">
                {photo.width} &times; {photo.height}
              </dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-gray-500">受信日</dt>
            <dd className="font-medium">{formatDate(photo.created_at)}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
