import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import Alert from "../../components/ui/Alert";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import { ApiError, senderApi } from "../../lib/api";

type Receiver = {
  handle: string;
  display_name: string;
  avatar_url: string | null;
  is_accepting: boolean;
  options: {
    allow_exif_embed: boolean;
    allow_watermark: boolean;
  };
};

export default function LandingPage() {
  const { handle } = useParams<{ handle: string }>();
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

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error === "not_found") {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-3 text-center">
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">
            ユーザーが見つかりません
          </h1>
          <p className="text-[14px] text-ink-soft">URLに誤りがないかご確認ください。</p>
        </div>
      </div>
    );
  }

  if (error || !receiver) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <Alert variant="error">読み込みに失敗しました。時間をおいて再度お試しください。</Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-[20px] bg-surface p-8 shadow-card">
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
          <p className="text-[14px] text-ink-soft">写真を{receiver.display_name}さんに送れます</p>
          {receiver.is_accepting ? (
            <Link
              to={`/send/${receiver.handle}/upload`}
              className="block rounded-xl bg-brand px-4 py-3 text-[16px] font-medium text-white transition-all hover:bg-brand-deep active:scale-[0.98]"
            >
              写真を送る
            </Link>
          ) : (
            <Alert variant="info">現在、この受信者は写真を受け付けていません。</Alert>
          )}
        </div>
      </div>
    </div>
  );
}
