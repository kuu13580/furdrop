import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Plural, Trans } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import SenderAtmosphere from "../../components/send/SenderAtmosphere";
import Alert from "../../components/ui/Alert";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import { onImageError } from "../../lib/analytics";
import { ApiError, senderApi } from "../../lib/api";
import { withKey } from "../../lib/send-url";

type SessionPhoto = {
  photo_id: string;
  thumb_url: string | null;
  filename: string | null;
  status: string;
};

const SESSION_EXPIRED = msg`セッションが期限切れです`;
const FETCH_FAILED = msg`結果の取得に失敗しました`;

export default function DonePage() {
  const { i18n } = useLingui();
  const { handle } = useParams<{ handle: string }>();
  const [searchParams] = useSearchParams();
  const accessKey = searchParams.get("k");
  const location = useLocation();
  const navigate = useNavigate();
  const sessionId = (location.state as { sessionId?: string } | null)?.sessionId;

  const [photos, setPhotos] = useState<SessionPhoto[] | null>(null);
  const [error, setError] = useState<MessageDescriptor | null>(null);

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
        setError(err instanceof ApiError && err.status === 404 ? SESSION_EXPIRED : FETCH_FAILED);
      });
    return () => {
      cancelled = true;
    };
  }, [handle, sessionId, navigate, accessKey]);

  const completed = photos?.filter((p) => p.status === "completed") ?? [];
  const failed = photos?.filter((p) => p.status !== "completed") ?? [];
  const completedCount = completed.length;
  const failedCount = failed.length;

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
            {/* 元は sm:hidden の <br> で改行位置を作っていたが、英語では別の位置で折り返す
                必要があるため自然折り返しに任せる */}
            <h1 className="text-[22px] font-bold leading-[1.2] tracking-[-0.015em] text-ink sm:text-[28px]">
              <Plural value={completedCount} other="#枚の写真を送信しました！" />
            </h1>

            {failedCount > 0 && (
              <Alert variant="error">
                <Plural value={failedCount} other="#枚のアップロードに失敗しました" />
              </Alert>
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
                        onError={onImageError("done-thumb", "thumb")}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : error ? (
          <>
            <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">
              <Trans>送信完了</Trans>
            </h1>
            <Alert variant="error">{i18n._(error)}</Alert>
          </>
        ) : (
          <LoadingSpinner size="lg" />
        )}

        <Link
          to={withKey(`/send/${handle}/upload`, accessKey)}
          className="mx-auto block max-w-sm rounded-xl bg-brand px-4 py-3 text-[16px] font-medium text-white transition-all hover:bg-brand-deep active:scale-[0.98]"
        >
          <Trans>別の写真を送る</Trans>
        </Link>
      </div>
    </div>
  );
}
