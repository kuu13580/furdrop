import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import SenderAtmosphere from "../../components/send/SenderAtmosphere";
import Alert from "../../components/ui/Alert";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import { ApiError, type EmbedMode, senderApi } from "../../lib/api";
import { withKey } from "../../lib/send-url";

type Receiver = {
  handle: string;
  display_name: string;
  avatar_url: string | null;
  is_accepting: boolean;
  options: {
    exif_embed_mode: EmbedMode;
    watermark_mode: EmbedMode;
  };
};

export default function LandingPage() {
  const { handle } = useParams<{ handle: string }>();
  const [searchParams] = useSearchParams();
  const accessKey = searchParams.get("k");
  const [receiver, setReceiver] = useState<Receiver | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"not_found" | "unknown" | null>(null);

  useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    setLoading(true);
    senderApi
      .getReceiver(handle)
      .then((res) => {
        if (!cancelled) setReceiver(res.receiver);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setError("not_found");
        else setError("unknown");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handle]);

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-10 sm:py-16">
      <SenderAtmosphere tone="warm" />
      <div className="relative z-10 w-full max-w-sm">
        {loading ? (
          <div className="flex justify-center py-10">
            <LoadingSpinner size="lg" />
          </div>
        ) : error === "not_found" ? (
          <div className="space-y-3 text-center">
            <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">
              ユーザーが見つかりません
            </h1>
            <p className="text-[14px] text-ink-soft">URLに誤りがないかご確認ください。</p>
          </div>
        ) : error || !receiver ? (
          <Alert variant="error">読み込みに失敗しました。時間をおいて再度お試しください。</Alert>
        ) : (
          <div className="rounded-[20px] bg-surface p-8 shadow-modal">
            <div className="space-y-5 text-center">
              {receiver.avatar_url ? (
                <img
                  src={receiver.avatar_url}
                  alt={receiver.display_name}
                  className="mx-auto h-20 w-20 rounded-full border-2 border-white object-cover shadow-card"
                />
              ) : (
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-white bg-surface-sand text-[32px] font-semibold text-ink-soft shadow-card">
                  {receiver.display_name.charAt(0)}
                </div>
              )}
              <div>
                <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">
                  {receiver.display_name}
                </h1>
                <p className="mt-1 font-mono text-[14px] text-ink-soft">@{receiver.handle}</p>
              </div>
              <p className="text-[14px] text-ink-soft">
                写真を{receiver.display_name}さんに送れます
              </p>
              {receiver.is_accepting ? (
                <Link
                  to={withKey(`/send/${receiver.handle}/upload`, accessKey)}
                  className="block rounded-xl bg-brand px-4 py-3 text-[16px] font-medium text-white transition-all hover:bg-brand-deep active:scale-[0.98]"
                >
                  写真を送る
                </Link>
              ) : (
                <Alert variant="info">現在、この受信者は写真を受け付けていません。</Alert>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
