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

  const handleDownloadQr = useCallback(async () => {
    const dataUrl = await QRCode.toDataURL(receiveUrl, { width: 512, margin: 2 });
    // URL に ?k=KEY が乗るようになったので、path 末尾のみを取り出してファイル名にする
    // (`new URL().pathname` で クエリを切り落とす)
    const path = new URL(receiveUrl, window.location.origin).pathname;
    const slug = path.split("/").filter(Boolean).pop() ?? "qr";
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `furdrop-${slug}.png`;
    a.click();
  }, [receiveUrl]);

  useEffect(() => {
    if (qrOpen && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, receiveUrl, { width: 200, margin: 2 });
    }
  }, [qrOpen, receiveUrl]);

  return (
    <Card title="あなたの受信URL">
      <div className="space-y-3">
        <p className="break-all rounded-xl bg-surface-canvas px-3 py-2 font-mono text-[14px] text-ink">
          {receiveUrl}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-xl border border-surface-sand-deep bg-surface-sand px-3 py-2 text-[14px] font-medium text-ink transition-colors hover:bg-surface-sand-hover"
          >
            {copied ? "コピーしました!" : "コピー"}
          </button>
          <button
            type="button"
            onClick={() => setQrOpen((v) => !v)}
            className="rounded-xl border border-surface-sand-deep bg-surface-sand px-3 py-2 text-[14px] font-medium text-ink transition-colors hover:bg-surface-sand-hover"
          >
            QR
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="rounded-xl border border-surface-sand-deep bg-surface-sand px-3 py-2 text-[14px] font-medium text-ink transition-colors hover:bg-surface-sand-hover"
          >
            シェア
          </button>
        </div>
        <p className="text-[12px] text-ink-soft">
          <Link to="/guide" className="text-brand underline-offset-2 hover:underline">
            FurDrop の使い方を見る →
          </Link>
        </p>
        {qrOpen && (
          <div className="flex flex-col items-center gap-3 py-2">
            <canvas ref={canvasRef} className="rounded-xl" />
            <button
              type="button"
              onClick={handleDownloadQr}
              className="rounded-xl border border-surface-sand-deep bg-surface-sand px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface-sand-hover"
            >
              QRをダウンロード
            </button>
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
        <p className="py-6 text-center text-[14px] text-ink-muted">まだ写真がありません</p>
      </Card>
    );
  }

  return (
    <Card title="最近の写真">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {photos.map((photo) => (
          <Link
            key={photo.id}
            to={`/gallery/${photo.id}`}
            state={{ photo }}
            className="group flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-surface-canvas transition-transform hover:scale-[1.02]"
          >
            {photo.thumb_url ? (
              <img
                src={photo.thumb_url}
                alt={photo.sender_name ?? "写真"}
                className="max-h-full max-w-full rounded-xl object-contain"
                loading="lazy"
              />
            ) : (
              <svg
                className="h-8 w-8 text-ink-muted"
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
            )}
          </Link>
        ))}
      </div>
      <div className="mt-4 text-right">
        <Link
          to="/gallery"
          className="text-[14px] font-medium text-brand transition-colors hover:text-brand-deep"
        >
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
      <h1 className="text-[22px] font-bold tracking-[-0.015em] text-ink sm:text-[28px]">
        ダッシュボード
      </h1>
      <PublicUrlCard receiveUrl={`${window.location.origin}${user.receive_url}`} />
      <Card title="ストレージ">
        <StorageQuotaBar used={user.storage_used} quota={user.storage_quota} />
      </Card>
      <RecentPhotos photos={photos} loading={loading} />
    </div>
  );
}
