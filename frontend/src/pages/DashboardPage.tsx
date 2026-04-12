import { useAtomValue, useSetAtom } from "jotai";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import Card from "../components/ui/Card";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import StorageQuotaBar from "../components/ui/StorageQuotaBar";
import { receiverApi } from "../lib/api";
import { userAtom } from "../stores/user";
import type { Photo } from "../types/photo";

function PublicUrlCard({ receiveUrl }: { receiveUrl: string }) {
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(receiveUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [receiveUrl]);

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      await navigator.share({ title: "FurDrop", url: receiveUrl });
    } else {
      const text = encodeURIComponent(`写真はこちらから送ってください！\n${receiveUrl}`);
      window.open(`https://x.com/intent/tweet?text=${text}`, "_blank");
    }
  }, [receiveUrl]);

  useEffect(() => {
    if (qrOpen && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, receiveUrl, { width: 200, margin: 2 });
    }
  }, [qrOpen, receiveUrl]);

  return (
    <Card title="あなたの受信URL">
      <div className="space-y-3">
        <p className="break-all rounded bg-gray-50 px-3 py-2 font-mono text-sm">{receiveUrl}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            {copied ? "コピーしました!" : "コピー"}
          </button>
          <button
            type="button"
            onClick={() => setQrOpen((v) => !v)}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            QR
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            シェア
          </button>
        </div>
        {qrOpen && (
          <div className="flex justify-center py-2">
            <canvas ref={canvasRef} />
          </div>
        )}
      </div>
    </Card>
  );
}

function RecentPhotos({ photos, loading }: { photos: Photo[]; loading: boolean }) {
  if (loading) {
    return (
      <Card title="最近の写真">
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      </Card>
    );
  }

  if (photos.length === 0) {
    return (
      <Card title="最近の写真">
        <p className="py-4 text-center text-gray-400">まだ写真がありません</p>
      </Card>
    );
  }

  return (
    <Card title="最近の写真">
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <Link
            key={photo.id}
            to={`/gallery/${photo.id}`}
            state={{ photo }}
            className="group relative aspect-square overflow-hidden rounded-lg bg-gray-100"
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
                <svg
                  className="h-8 w-8"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  role="img"
                  aria-label="画像なし"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
                  />
                </svg>
              </div>
            )}
          </Link>
        ))}
      </div>
      <div className="mt-3 text-right">
        <Link to="/gallery" className="text-sm text-blue-600 hover:underline">
          全て見る &rarr;
        </Link>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const user = useAtomValue(userAtom);
  const setUser = useSetAtom(userAtom);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // 写真一覧を取得
    receiverApi
      .listPhotos({ limit: 6 })
      .then(({ photos }) => {
        if (!cancelled) setPhotos(photos);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // ストレージ使用量を最新に更新
    receiverApi
      .getQuota()
      .then((quota) => {
        if (!cancelled) {
          setUser((prev) =>
            prev
              ? { ...prev, storage_used: quota.storage_used, storage_quota: quota.storage_quota }
              : prev,
          );
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [setUser]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ダッシュボード</h1>
      <PublicUrlCard receiveUrl={`${window.location.origin}${user.receive_url}`} />
      <Card title="ストレージ">
        <StorageQuotaBar used={user.storage_used} quota={user.storage_quota} />
      </Card>
      <RecentPhotos photos={photos} loading={loading} />
    </div>
  );
}
