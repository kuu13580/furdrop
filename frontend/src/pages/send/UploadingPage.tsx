import { useAtom, useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import SenderAtmosphere from "../../components/send/SenderAtmosphere";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import { extractError, trackClientError, type UploadTarget } from "../../lib/analytics";
import { ApiError, senderApi } from "../../lib/api";
import { runConcurrent } from "../../lib/concurrency";
import { debugLog } from "../../lib/debug-log";
import {
  applyWatermark,
  embedSenderInfoInExif,
  generateThumbnail,
  getImageDimensions,
  isHeic,
  normalizeToJpeg,
  stripExifGps,
} from "../../lib/image-processing";
import { deletePhotos, getPhoto } from "../../lib/photo-store";
import { withKey } from "../../lib/send-url";
import { resolveWatermarkElements, serializeWatermark } from "../../lib/watermark";
import { debugAtom } from "../../stores/debug";
import { type SelectedFile, selectedFilesAtom, uploadFormAtom } from "../../stores/sender";

// 同時実行数の上限。モバイルのメモリ枯渇を避けるため並列度を抑える。
// 加工は createImageBitmap + Canvas 再エンコードで巨大な中間バッファが出るため少なめ。
// 送信はネットワーク I/O バウンドなので加工より多め。
const PROCESS_CONCURRENCY = 3;
const UPLOAD_CONCURRENCY = 4;

type Phase =
  | "pending"
  | "converting"
  | "processing"
  | "processed"
  | "uploading"
  | "completed"
  | "failed";

/** どのステップで失敗したか。"failed" 時に画像ごとの内訳を出すために保持 */
type FailedAt = "convert" | "upload";

type FileProgress = {
  selected: SelectedFile;
  phase: Phase;
  error?: string;
  failedAt?: FailedAt;
  photoId?: string;
};

type OverallPhase = "idle" | "processing" | "session" | "uploading" | "done" | "failed";

export default function UploadingPage() {
  const { handle } = useParams<{ handle: string }>();
  const [searchParams] = useSearchParams();
  const accessKey = searchParams.get("k");
  const navigate = useNavigate();
  // debugAtom はアプリ全体で共有。?debug=true は App 直下の DebugUrlSync が同期する
  const debug = useAtomValue(debugAtom);
  const [files, setFiles] = useAtom(selectedFilesAtom);
  const form = useAtomValue(uploadFormAtom);

  const [progress, setProgress] = useState<FileProgress[]>(
    files.map((f) => ({ selected: f, phase: "pending" as Phase })),
  );
  const [overall, setOverall] = useState<OverallPhase>("idle");
  const [globalError, setGlobalError] = useState<string | null>(null);
  const startedRef = useRef(false);

  // 遷移直前のページで files が空ならUploadページへ戻す
  // パイプライン完了後の setFiles([]) による空状態では戻さない
  useEffect(() => {
    if (files.length === 0 && !startedRef.current) {
      navigate(withKey(`/send/${handle}/upload`, accessKey), { replace: true });
    }
  }, [files.length, handle, navigate, accessKey]);

  // ルート遷移時にスクロール位置が前ページから引き継がれるため、初回マウントで先頭へ
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // 離脱防止
  useEffect(() => {
    if (overall === "done" || overall === "failed" || overall === "idle") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [overall]);

  // 初回一回だけパイプライン開始 (ref で二重起動を防止)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally run once; guarded by startedRef
  useEffect(() => {
    if (startedRef.current || !handle || files.length === 0) return;
    startedRef.current = true;
    void runPipeline({
      handle,
      accessKey,
      files,
      form,
      onProgress: (updater) => setProgress(updater),
      onOverall: setOverall,
      onGlobalError: setGlobalError,
      onDone: (sessionId) => {
        // 選択状態をクリアしつつ、UIでの表示用ObjectURLと IndexedDB の bytes を解放
        for (const f of files) if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
        void deletePhotos(files.map((f) => f.id));
        setFiles([]);
        navigate(withKey(`/send/${handle}/done`, accessKey), {
          state: { sessionId },
          replace: true,
        });
      },
    });
  }, []);

  const total = progress.length;
  // 加工と送信で独立した 0-100% 進捗。フェーズ移行時にバーは一度 0 に戻る。
  const processedCount = progress.filter(
    (p) => p.phase === "processed" || p.phase === "uploading" || p.phase === "completed",
  ).length;
  const uploadedCount = progress.filter((p) => p.phase === "completed").length;
  const isUploadingPhase = overall === "session" || overall === "uploading" || overall === "done";
  const current = isUploadingPhase ? uploadedCount : processedCount;
  const percent = total === 0 ? 0 : Math.round((current / total) * 100);

  return (
    <div className="relative overflow-hidden px-4 py-6 sm:py-8">
      <SenderAtmosphere tone="calm" />
      <div className="relative z-10 mx-auto max-w-3xl space-y-6">
        <div className="text-center">
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">送信中...</h1>
          <p className="mt-1 text-[13px] text-ink-soft">ページを閉じないでください</p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-[14px]">
            <span className="font-medium text-ink">{overallLabel(overall)}</span>
            <span className="font-mono text-ink-soft">
              {current}/{total}枚 · {percent}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-sand">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {globalError && <Alert variant="error">{globalError}</Alert>}

        <ul className="divide-y divide-surface-sand-deep overflow-hidden rounded-2xl bg-surface shadow-card">
          {progress.map((p) => (
            <li key={p.selected.id} className="flex flex-col gap-0.5 px-4 py-2.5 text-[14px]">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate pr-3 text-ink">{p.selected.file.name}</span>
                <span className={`shrink-0 font-medium ${phaseColor(p.phase)}`}>
                  {phaseLabel(p.phase, p.failedAt)}
                </span>
              </div>
              {debug && p.phase === "failed" && p.error && (
                <p className="break-all pr-3 font-mono text-[11px] leading-[1.4] text-status-danger">
                  {p.error}
                </p>
              )}
            </li>
          ))}
        </ul>

        {overall === "failed" && (
          <div className="space-y-2">
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={() => navigate(withKey(`/send/${handle}/upload`, accessKey))}
            >
              アップロード画面に戻る
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function overallLabel(p: OverallPhase): string {
  switch (p) {
    case "idle":
      return "準備中";
    case "processing":
      return "画像を加工中";
    case "session":
      return "サーバーに接続中";
    case "uploading":
      return "アップロード中";
    case "done":
      return "完了";
    case "failed":
      return "失敗";
  }
}

function phaseLabel(p: Phase, failedAt?: FailedAt): string {
  switch (p) {
    case "pending":
      return "待機";
    case "converting":
      return "HEIC変換中...";
    case "processing":
      return "加工中";
    case "processed":
      return "加工済";
    case "uploading":
      return "送信中";
    case "completed":
      return "完了";
    case "failed":
      if (failedAt === "convert") return "変換失敗";
      if (failedAt === "upload") return "送信失敗";
      return "失敗";
  }
}

function phaseColor(p: Phase): string {
  switch (p) {
    case "completed":
      return "text-status-success";
    case "failed":
      return "text-status-danger";
    case "pending":
      return "text-ink-muted";
    case "processed":
      return "text-ink-soft";
    default:
      return "text-brand";
  }
}

type ProcessedFile = {
  id: string;
  originalName: string;
  processedBlob: Blob;
  thumbBlob: Blob;
  width: number;
  height: number;
};

type PipelineArgs = {
  handle: string;
  accessKey: string | null;
  files: SelectedFile[];
  form: ReturnType<typeof useAtomValue<typeof uploadFormAtom>>;
  onProgress: (updater: (prev: FileProgress[]) => FileProgress[]) => void;
  onOverall: (p: OverallPhase) => void;
  onGlobalError: (msg: string | null) => void;
  onDone: (sessionId: string) => void;
};

async function runPipeline({
  handle,
  accessKey,
  files,
  form,
  onProgress,
  onOverall,
  onGlobalError,
  onDone,
}: PipelineArgs) {
  const updatePhase = (id: string, phase: Phase, error?: string, failedAt?: FailedAt) => {
    onProgress((prev) =>
      prev.map((p) => (p.selected.id === id ? { ...p, phase, error, failedAt } : p)),
    );
  };
  const setPhotoId = (id: string, photoId: string) => {
    onProgress((prev) => prev.map((p) => (p.selected.id === id ? { ...p, photoId } : p)));
  };

  const plog = debugLog.scope("pipeline");
  plog.log(
    `開始 ${files.length}枚`,
    files.map((f) => ({ name: f.file.name, type: f.file.type, size: f.file.size })),
  );

  // --- 画像加工フェーズ ---
  onOverall("processing");
  const credit = form.senderName.trim();
  const exifText = form.exifEnabled && credit ? credit : "";
  const watermarkElements = form.watermarkEnabled
    ? resolveWatermarkElements(form.watermarkElements, credit)
    : [];
  const hasWatermark = watermarkElements.length > 0;
  const watermarkText = hasWatermark ? serializeWatermark(watermarkElements) : "";
  plog.log(`加工フェーズ開始 (exif=${!!exifText}, watermark=${hasWatermark})`);
  const processedResults = await runConcurrent(
    files,
    PROCESS_CONCURRENCY,
    async (f): Promise<ProcessedFile> => {
      const flog = plog.scope(f.file.name);
      const endTimer = flog.time("加工");
      try {
        if (isHeic(f.file)) updatePhase(f.id, "converting");
        // 実体 bytes は IndexedDB に退避済み。取り出してメタ (名前/MIME) と共に渡す。
        const original = await getPhoto(f.id);
        flog.log(`IndexedDB から取得 (${original.size}B, type=${original.type})`);
        const jpeg = await normalizeToJpeg(original, f.file);
        flog.log(`JPEG 正規化完了 (${jpeg.size}B)`);

        updatePhase(f.id, "processing");
        // 透かしあり: Canvas再エンコード (既存EXIFは剥がれる)
        // 透かしなし: 元のJPEGをそのまま使う (既存EXIFを温存)
        let afterWatermark: Blob;
        let width: number;
        let height: number;
        if (hasWatermark) {
          const r = await applyWatermark(jpeg, watermarkElements);
          afterWatermark = r.blob;
          width = r.width;
          height = r.height;
        } else {
          afterWatermark = jpeg;
          const dim = await getImageDimensions(jpeg);
          width = dim.width;
          height = dim.height;
        }

        // EXIF埋め込みは最後（Canvas再エンコードで剥がれるため）
        const withSender = exifText
          ? await embedSenderInfoInExif(afterWatermark, exifText)
          : afterWatermark;

        // プライバシー保護のため EXIF GPS を既定で除去（プラポリ第2.2.3項）
        const finalBlob = await stripExifGps(withSender);

        const thumb = await generateThumbnail(finalBlob);

        updatePhase(f.id, "processed");
        endTimer();
        flog.log(`加工完了 (${width}x${height}, final=${finalBlob.size}B, thumb=${thumb.size}B)`);

        return {
          id: f.id,
          originalName: f.file.name,
          processedBlob: finalBlob,
          thumbBlob: thumb,
          width,
          height,
        };
      } catch (err) {
        // HEIC変換, PNG→JPEG変換, 透かし合成, EXIF埋込, GPS除去, サムネイル生成 — 一括して "convert"
        flog.dumpError(
          `加工失敗 (name=${f.file.name}, type=${f.file.type}, size=${f.file.size}B, heic=${isHeic(f.file)})`,
          err,
        );
        // API に出ないクライアント側の変換失敗 (iOS OOM デコード / canvas OOM / HEIC 変換失敗等) を計測
        trackClientError({
          error_kind: "image_processing",
          context: "pipeline",
          ...extractError(err),
        });
        updatePhase(f.id, "failed", describeError(err), "convert");
        throw err;
      }
    },
  );

  const processed: ProcessedFile[] = [];
  for (const r of processedResults) {
    if (r.status === "fulfilled") processed.push(r.value);
  }
  plog.log(`加工フェーズ完了: 成功 ${processed.length}/${files.length}枚`);
  if (processed.length === 0) {
    onGlobalError("全ての画像の加工に失敗しました");
    onOverall("failed");
    return;
  }

  // --- セッション作成 ---
  onOverall("session");
  // 加工完了後に空キー (?k= 未指定) で 400/403 を引いてユーザーを待たせないよう、ここで早期に弾く
  if (!accessKey) {
    onGlobalError(
      "受信URLが無効です。送信者本人から最新の受信URL（?k=... 付き）を受け取ってください。",
    );
    onOverall("failed");
    return;
  }
  let sessionId: string;
  try {
    const res = await senderApi.createSession(handle, {
      key: accessKey,
      sender_name: form.senderName || undefined,
      photo_count: processed.length,
    });
    sessionId = res.session_id;
    plog.log(`セッション作成成功 (sessionId=${sessionId})`);
  } catch (err) {
    plog.dumpError("セッション作成失敗", err);
    // 403 INVALID_KEY は URL の ?k= が無い/間違っているケース。専用の案内に差し替える。
    if (err instanceof ApiError && err.status === 403 && err.code === "INVALID_KEY") {
      onGlobalError(
        "受信URLが無効です。送信者本人から最新の受信URL（?k=... 付き）を受け取ってください。",
      );
      onOverall("failed");
      return;
    }
    onGlobalError(rateLimitOrFallback(err, "セッション作成に失敗"));
    onOverall("failed");
    return;
  }

  // --- Presigned URL発行（バッチ） ---
  let uploads: Awaited<ReturnType<typeof senderApi.createPhotos>>["uploads"];
  try {
    const res = await senderApi.createPhotos(handle, sessionId, {
      photos: processed.map((p) => ({
        filename: p.originalName,
        file_size: p.processedBlob.size,
        thumb_size: p.thumbBlob.size,
        width: p.width,
        height: p.height,
        camera_model: exifText || undefined,
        watermark_text: watermarkText || undefined,
      })),
    });
    uploads = res.uploads;
    plog.log(`Presigned URL 発行成功 (${uploads.length}件)`);
  } catch (err) {
    plog.dumpError("Presigned URL 発行失敗", err);
    onGlobalError(rateLimitOrFallback(err, "URL取得に失敗"));
    onOverall("failed");
    return;
  }

  // processed と uploads を 1:1 対応させる（APIは送信順に返る想定）
  for (let i = 0; i < processed.length; i++) {
    setPhotoId(processed[i].id, uploads[i].photo_id);
  }

  // --- アップロード + confirm（並列度制限） ---
  onOverall("uploading");
  await runConcurrent(processed, UPLOAD_CONCURRENCY, async (p, i) => {
    const up = uploads[i];
    const flog = plog.scope(p.originalName);
    const endTimer = flog.time("送信");
    updatePhase(p.id, "uploading");
    try {
      await Promise.all([
        putBlob(up.upload_url, p.processedBlob, "original"),
        putBlob(up.thumb_upload_url, p.thumbBlob, "thumb"),
      ]);
      await senderApi.confirmPhoto(handle, sessionId, up.photo_id, {
        thumb_size: p.thumbBlob.size,
      });
      updatePhase(p.id, "completed");
      endTimer();
    } catch (err) {
      // putBlob (R2 PUT) または confirmPhoto (Workers PATCH) の失敗を "upload" に集約
      flog.dumpError(`送信失敗 (photoId=${up.photo_id}, size=${p.processedBlob.size}B)`, err);
      updatePhase(p.id, "failed", describeError(err), "upload");
    }
  });

  // 結果に応じてDoneへ
  onOverall("done");
  plog.log("パイプライン完了");
  onDone(sessionId);
}

async function putBlob(url: string, blob: Blob, target: UploadTarget): Promise<void> {
  // R2 への直 PUT は Workers を経由しないため、失敗は API ログに出ない。GA で計測する。
  let res: Response;
  try {
    res = await fetch(url, {
      method: "PUT",
      body: blob,
      headers: { "Content-Type": "image/jpeg" },
      // モバイル回線で失敗しないまま長時間ハングするのを防ぐ (20MB 画像を考慮した猶予)
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    // ネットワーク断 / CORS プリフライト失敗など (fetch 自体が reject)
    trackClientError({ error_kind: "upload_put", context: "r2-put", target, ...extractError(err) });
    throw err;
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    // presigned URL の期限切れ(403)・署名不一致など
    trackClientError({
      error_kind: "upload_put",
      context: "r2-put",
      target,
      http_status: res.status,
    });
    throw new Error(`PUT failed: ${res.status} ${txt.slice(0, 120)}`);
  }
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message || err.code;
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * 429（レート制限）のときはユーザー向けに「制限と原因と再試行案内」を返す。
 * それ以外のエラーは prefix を付けてそのまま返す。
 */
function rateLimitOrFallback(err: unknown, prefix: string): string {
  if (err instanceof ApiError && err.status === 429) {
    return "短時間に多くのリクエストが集中したため、不正利用（bot 等）対策により一時的に送信を制限しています。1〜2分ほど時間をおいてからもう一度お試しください。";
  }
  return `${prefix}: ${describeError(err)}`;
}
