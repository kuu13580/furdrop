import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useAtomValue, useSetAtom } from "jotai";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import Alert from "../components/ui/Alert";
import Card from "../components/ui/Card";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import StorageQuotaBar from "../components/ui/StorageQuotaBar";
import { onImageError } from "../lib/analytics";
import { receiverApi } from "../lib/api";
import { isQuotaFull, QUOTA_DANGER_PERCENT, QUOTA_WARN_PERCENT, usagePercent } from "../lib/quota";
import { daysUntilExpiry } from "../lib/retention";
import { userAtom } from "../stores/user";
import type { Photo } from "../types/photo";

function PublicUrlCard({ receiveUrl, isAccepting }: { receiveUrl: string; isAccepting: boolean }) {
  const { t } = useLingui();
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
      const text = encodeURIComponent(t`写真はこちらから送ってください！\n${receiveUrl}`);
      window.open(`https://x.com/intent/tweet?text=${text}`, "_blank");
    }
  }, [receiveUrl, t]);

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
    <Card title={t`あなたの受信URL`}>
      <div className="space-y-3">
        {!isAccepting && (
          <Alert variant="info">
            <Trans>
              写真の受付を停止中です。このURLを開いても写真は送れません。設定から再開できます。
            </Trans>
          </Alert>
        )}
        <p className="break-all rounded-xl bg-surface-canvas px-3 py-2 font-mono text-[14px] text-ink">
          {receiveUrl}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-xl border border-surface-sand-deep bg-surface-sand px-3 py-2 text-[14px] font-medium text-ink transition-colors hover:bg-surface-sand-hover"
          >
            {copied ? t`コピーしました!` : t`コピー`}
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
            <Trans>シェア</Trans>
          </button>
        </div>
        <p className="text-[12px] text-ink-soft">
          <Link to="/guide" className="text-brand underline-offset-2 hover:underline">
            <Trans>FurDrop の使い方を見る →</Trans>
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
              <Trans>QRをダウンロード</Trans>
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * DL 期限が近い写真の予告 (R13)。
 *
 * 受信者に気づかせる手段がログイン時の画面しかない (プッシュ通知は Phase 2) ため、
 * サーバー側の集計窓を 60日 と広く取り、ダッシュボードの最上部に出す。
 * 該当0件なら描画しないので、閉じるボタンは持たせていない。
 */
function ExpiryWarning({ count, earliestExpiresAt }: { count: number; earliestExpiresAt: number }) {
  const days = daysUntilExpiry(earliestExpiresAt);
  return (
    <Alert variant="warn">
      <p className="font-semibold">
        <Plural value={count} other="#枚の写真が自動削除の期限に近づいています" />
      </p>
      <p className="mt-1 text-[13px] leading-[1.5]">
        {days > 0 ? (
          <Plural value={days} other="最短であと#日で削除されます。" />
        ) : (
          <Trans>まもなく削除されます。</Trans>
        )}{" "}
        <Trans>まだ保存していない写真は早めにダウンロードしてください。</Trans>{" "}
        {/* 色は Alert のバリアントから継承する (warn は Ink、error は Rust) */}
        <Link to="/gallery" className="font-medium underline underline-offset-2">
          <Trans>ギャラリーで確認する &rarr;</Trans>
        </Link>
      </p>
    </Alert>
  );
}

/**
 * ストレージ逼迫の予告 (R07/X02)。
 *
 * 上限に達すると送信者側が「送れない」状態になり、しかも送信者からは受信者に連絡する
 * 手段がない。手遅れになる前に受信者へ気づかせる必要があるので、カード内の
 * プログレスバー任せにせず独立したバナーとして出す。
 */
function QuotaWarning({ used, quota }: { used: number; quota: number }) {
  const percent = usagePercent(used, quota);
  if (percent < QUOTA_WARN_PERCENT) return null;
  const full = isQuotaFull(used, quota);
  return (
    <Alert variant={percent >= QUOTA_DANGER_PERCENT ? "error" : "warn"}>
      <p className="font-semibold">
        {full ? (
          <Trans>保存容量がいっぱいです</Trans>
        ) : (
          <Trans>保存容量の残りが少なくなっています</Trans>
        )}
      </p>
      <p className="mt-1 text-[13px] leading-[1.5]">
        {full ? (
          <Trans>新しい写真を受け取れません。不要な写真を削除して空きを作ってください。</Trans>
        ) : (
          <Trans>上限に達すると新しい写真を受け取れなくなります。</Trans>
        )}{" "}
        <Link to="/gallery" className="font-medium underline underline-offset-2">
          <Trans>ギャラリーで整理する &rarr;</Trans>
        </Link>
      </p>
    </Alert>
  );
}

function RecentPhotos({ photos, loading }: { photos: Photo[]; loading: boolean }) {
  const { t } = useLingui();
  if (loading) {
    return (
      <Card title={t`最近の写真`}>
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      </Card>
    );
  }

  if (photos.length === 0) {
    return (
      <Card title={t`最近の写真`}>
        <p className="py-6 text-center text-[14px] text-ink-muted">
          <Trans>まだ写真がありません</Trans>
        </p>
      </Card>
    );
  }

  return (
    <Card title={t`最近の写真`}>
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
                alt={photo.sender_name ?? t`写真`}
                className="max-h-full max-w-full rounded-xl object-contain"
                loading="lazy"
                onError={onImageError("dashboard-thumb", "thumb")}
              />
            ) : (
              <svg
                className="h-8 w-8 text-ink-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                role="img"
                aria-label={t`画像なし`}
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
          <Trans>全て見る &rarr;</Trans>
        </Link>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { t } = useLingui();
  const user = useAtomValue(userAtom);
  const setUser = useSetAtom(userAtom);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expiringSoon, setExpiringSoon] = useState<{
    count: number;
    earliest_expires_at: number | null;
  } | null>(null);

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
          setExpiringSoon(quota.expiring_soon);
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
        <Trans>ダッシュボード</Trans>
      </h1>
      <QuotaWarning used={user.storage_used} quota={user.storage_quota} />
      {expiringSoon && expiringSoon.count > 0 && expiringSoon.earliest_expires_at !== null && (
        <ExpiryWarning
          count={expiringSoon.count}
          earliestExpiresAt={expiringSoon.earliest_expires_at}
        />
      )}
      <PublicUrlCard
        receiveUrl={`${window.location.origin}${user.receive_url}`}
        isAccepting={user.is_active}
      />
      <Card title={t`ストレージ`}>
        {/* 説明文は QuotaWarning が担うので、ここでは二度言わない */}
        <StorageQuotaBar used={user.storage_used} quota={user.storage_quota} hint={false} />
      </Card>
      <RecentPhotos photos={photos} loading={loading} />
    </div>
  );
}
