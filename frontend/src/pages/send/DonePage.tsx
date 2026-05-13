import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import SenderAtmosphere from "../../components/send/SenderAtmosphere";
import Alert from "../../components/ui/Alert";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import { ApiError, senderApi } from "../../lib/api";
import { withKey } from "../../lib/send-url";

type SessionPhoto = {
  photo_id: string;
  thumb_url: string | null;
  filename: string | null;
  status: string;
};

export default function DonePage() {
  const { handle } = useParams<{ handle: string }>();
  const [searchParams] = useSearchParams();
  const accessKey = searchParams.get("k");
  const location = useLocation();
  const navigate = useNavigate();
  const sessionId = (location.state as { sessionId?: string } | null)?.sessionId;

  const [photos, setPhotos] = useState<SessionPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!handle) return;
    if (!sessionId) {
      // 直接アクセス / リロード時はLandingへ戻す
      navigate(withKey(`/send/${handle}`, accessKey), { replace: true });
      return;
    }
    let cancelled = false;
    senderApi
      .getSession(handle, sessionId)
      .then((res) => {
        if (!cancelled) setPhotos(res.photos);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setError("セッションが期限切れです");
        } else {
          setError("結果の取得に失敗しました");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [handle, sessionId, navigate, accessKey]);

  const completed = photos?.filter((p) => p.status === "completed") ?? [];
  const failed = photos?.filter((p) => p.status !== "completed") ?? [];

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-10 sm:py-16">
      <SenderAtmosphere tone="celebrate" />
      <div className="relative z-10 w-full max-w-2xl space-y-6 py-6 text-center">
        {photos ? (
          <>
            <div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-status-success-tint text-[28px] text-status-success shadow-card"
              aria-hidden="true"
            >
              ✓
            </div>
            <h1 className="text-[22px] font-bold leading-[1.2] tracking-[-0.015em] text-ink sm:text-[28px]">
              {completed.length}枚の写真を
              <br className="sm:hidden" />
              送信しました！
            </h1>

            {failed.length > 0 && (
              <Alert variant="error">{failed.length}枚のアップロードに失敗しました</Alert>
            )}

            {completed.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {completed.map((p) => (
                  <div
                    key={p.photo_id}
                    className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-surface shadow-card"
                  >
                    {p.thumb_url ? (
                      <img
                        src={p.thumb_url}
                        alt={p.filename ?? ""}
                        className="max-h-full max-w-full rounded-xl object-contain"
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : error ? (
          <>
            <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">送信完了</h1>
            <Alert variant="error">{error}</Alert>
          </>
        ) : (
          <LoadingSpinner size="lg" />
        )}

        <Link
          to={withKey(`/send/${handle}/upload`, accessKey)}
          className="mx-auto block max-w-sm rounded-xl bg-brand px-4 py-3 text-[16px] font-medium text-white transition-all hover:bg-brand-deep active:scale-[0.98]"
        >
          別の写真を送る
        </Link>
      </div>
    </div>
  );
}
