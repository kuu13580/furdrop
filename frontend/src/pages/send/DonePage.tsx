import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import Alert from "../../components/ui/Alert";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import { ApiError, senderApi } from "../../lib/api";

type SessionPhoto = {
  photo_id: string;
  thumb_url: string | null;
  filename: string | null;
  status: string;
};

export default function DonePage() {
  const { handle } = useParams<{ handle: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const sessionId = (location.state as { sessionId?: string } | null)?.sessionId;

  const [photos, setPhotos] = useState<SessionPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!handle) return;
    if (!sessionId) {
      // 直接アクセス / リロード時はLandingへ戻す
      navigate(`/send/${handle}`, { replace: true });
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
  }, [handle, sessionId, navigate]);

  const completed = photos?.filter((p) => p.status === "completed") ?? [];
  const failed = photos?.filter((p) => p.status !== "completed") ?? [];

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="w-full max-w-md space-y-6 px-4 py-6 text-center">
        {photos ? (
          <>
            <div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-600"
              aria-hidden="true"
            >
              ✓
            </div>
            <h1 className="text-xl font-bold">{completed.length}枚の写真を送信しました！</h1>

            {failed.length > 0 && (
              <Alert variant="error">{failed.length}枚のアップロードに失敗しました</Alert>
            )}

            {completed.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {completed.map((p) => (
                  <div
                    key={p.photo_id}
                    className="aspect-square overflow-hidden rounded-md bg-gray-100"
                  >
                    {p.thumb_url ? (
                      <img
                        src={p.thumb_url}
                        alt={p.filename ?? ""}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : error ? (
          <>
            <h1 className="text-xl font-bold">送信完了</h1>
            <Alert variant="error">{error}</Alert>
          </>
        ) : (
          <LoadingSpinner size="lg" />
        )}

        <Link
          to={`/send/${handle}/upload`}
          className="block rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700"
        >
          別の写真を送る
        </Link>
      </div>
    </div>
  );
}
