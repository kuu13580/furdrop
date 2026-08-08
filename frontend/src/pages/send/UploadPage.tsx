import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useAtom } from "jotai";
import {
  type ChangeEvent,
  type DragEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import SenderAtmosphere from "../../components/send/SenderAtmosphere";
import WatermarkDialog from "../../components/send/WatermarkDialog";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { extractError, trackClientError } from "../../lib/analytics";
import { type EmbedMode, senderApi } from "../../lib/api";
import { runConcurrent } from "../../lib/concurrency";
import { debugLog } from "../../lib/debug-log";
import { i18n as globalI18n } from "../../lib/i18n";
import { generateId } from "../../lib/id";
import { generateThumbnail, isHeic, MAX_FILE_SIZE } from "../../lib/image-processing";
import { clearAllPhotos, deletePhotos, getPhoto, putPhoto } from "../../lib/photo-store";
import { withKey } from "../../lib/send-url";
import { resolveWatermarkElements } from "../../lib/watermark";
import {
  type PreviewCandidate,
  type SelectedFile,
  selectedFilesAtom,
  uploadFormAtom,
} from "../../stores/sender";

const ACCEPT = "image/jpeg,image/png,image/heic,image/heif,.heic,.heif";
const MAX_PHOTOS_PER_SESSION = 100;
const PREVIEW_CONCURRENCY = 3;
// IndexedDB への書き出し並列度。put は実体読み取り (content:// I/O) を伴うため
// 程よく並列化しつつ、瞬間的な読み取り競合を抑えるために控えめにする。
const STORE_CONCURRENCY = 4;
// Android では content:// 読み取り (NotReadableError) もデコード (EncodingError) も
// 資源競合で一時的に失敗することがある。いずれも遅延付きリトライで大半回収できる。
const STORE_RETRIES = 3;
const DECODE_RETRIES = 2;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 失敗時に遅延付きで再試行する。最後まで失敗したら最後の例外を投げる。 */
async function withRetry<T>(retries: number, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // リトライ待機中はワーカーが埋まり実効並列度が下がるため、
      // 同時デコード数も減ってメモリ逼迫が緩む副次効果がある。
      if (attempt < retries) await sleep(200 * (attempt + 1));
    }
  }
  throw lastErr;
}

const ACCEPTED_EXTS = /\.(jpe?g|png|hei[cf])$/i;

function isAccepted(file: File): boolean {
  const t = file.type.toLowerCase();
  if (t === "image/jpeg" || t === "image/png" || t === "image/heic" || t === "image/heif") {
    return true;
  }
  // ブラウザによってはHEICのMIMEが空になる → 拡張子で判定
  return ACCEPTED_EXTS.test(file.name);
}

/**
 * 透かしプレビュー候補を作る。非HEIC を先頭に並べ替え、ダイアログの初期自動選択が
 * decode の軽い非HEIC から始まるようにする。サムネは生成済みの ObjectURL を渡すだけ。
 * 実体 (File) はダイアログ側が選択時に getFile で都度取り出す。
 */
function buildPreviewCandidates(files: SelectedFile[]): PreviewCandidate[] {
  const toCandidate = (f: SelectedFile): PreviewCandidate => ({
    id: f.id,
    name: f.file.name,
    type: f.file.type,
    thumbUrl: f.previewUrl,
    isHeic: isHeic(f.file),
  });
  const nonHeic = files.filter((f) => !isHeic(f.file)).map(toCandidate);
  const heic = files.filter((f) => isHeic(f.file)).map(toCandidate);
  return [...nonHeic, ...heic];
}

export default function UploadPage() {
  const { t } = useLingui();
  const { handle } = useParams<{ handle: string }>();
  const [searchParams] = useSearchParams();
  const accessKey = searchParams.get("k");
  const navigate = useNavigate();
  const [files, setFiles] = useAtom(selectedFilesAtom);
  const [form, setForm] = useAtom(uploadFormAtom);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [noCreditConsent, setNoCreditConsent] = useState(false);
  const [watermarkDialogOpen, setWatermarkDialogOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [receiverOptions, setReceiverOptions] = useState<{
    exif_embed_mode: EmbedMode;
    watermark_mode: EmbedMode;
    require_sender_name: boolean;
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewSectionRef = useRef<HTMLDivElement>(null);
  const importTimeoutRef = useRef<number | null>(null);

  // 受信者の情報（display_name + オプション設定）を取得
  useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    senderApi
      .getReceiver(handle)
      .then((res) => {
        if (!cancelled) {
          setDisplayName(res.receiver.display_name);
          setReceiverOptions(res.receiver.options);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [handle]);

  // モバイルでは写真ピッカーが閉じてから change が発火するまでに数秒の「無の期間」がある
  // (端末側で HEIC→JPEG 変換・大量ファイルの転送等が走るため、iOS/Android いずれでも発生)。
  // change を待っていては手遅れなので、タップした瞬間にローダーを立て、
  // change / cancel または安全タイムアウトで解除する。
  // cancel イベントは Safari 16+ / Chrome 113+ で対応。未対応環境は 60s タイムアウトで吸収。
  // input element は renderDropZone の外側で 1 度だけマウントするので、effect も 1 度で十分。
  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) return;
    const handler = () => {
      setIsImporting(false);
      if (importTimeoutRef.current !== null) {
        window.clearTimeout(importTimeoutRef.current);
        importTimeoutRef.current = null;
      }
    };
    input.addEventListener("cancel", handler);
    return () => input.removeEventListener("cancel", handler);
  }, []);

  useEffect(
    () => () => {
      if (importTimeoutRef.current !== null) {
        window.clearTimeout(importTimeoutRef.current);
      }
    },
    [],
  );

  // リロード等で前回フローの bytes が IndexedDB に孤立して残る (atom はリロードで
  // 空に戻る)。選択が空の状態で開いたとき=新規フロー開始とみなし、一度だけ回収する。
  const cleanupRanRef = useRef(false);
  useEffect(() => {
    if (cleanupRanRef.current) return;
    cleanupRanRef.current = true;
    if (files.length === 0) void clearAllPhotos();
  }, [files.length]);

  const addFiles = (incoming: FileList | File[]) => {
    const wasEmpty = files.length === 0;
    const arr = Array.from(incoming);
    // メタ情報と実体 File をペアで保持。state にはメタのみ載せ、実体は IndexedDB へ退避する。
    const accepted: { meta: SelectedFile; file: File }[] = [];
    const rejected: string[] = [];
    for (const f of arr) {
      const name = f.name;
      if (!isAccepted(f)) {
        rejected.push(t`${name}: 対応外の形式`);
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        rejected.push(t`${name}: 20MBを超えています`);
        continue;
      }
      accepted.push({
        meta: {
          id: generateId(),
          file: { name: f.name, type: f.type, size: f.size },
          previewUrl: "",
          previewReady: false,
        },
        file: f,
      });
    }

    const mergedMetas = [...files, ...accepted.map((a) => a.meta)];
    const overflowedMetas: SelectedFile[] = [];
    if (mergedMetas.length > MAX_PHOTOS_PER_SESSION) {
      rejected.push(t`一度に送れるのは${MAX_PHOTOS_PER_SESSION}枚までです`);
      overflowedMetas.push(...mergedMetas.splice(MAX_PHOTOS_PER_SESSION));
    }
    setFiles(mergedMetas);
    setError(rejected.length > 0 ? rejected.join("\n") : null);

    // 上限超過で切り落とされた分は IndexedDB 未保存なのでクリーンアップ不要
    const toProcess = accepted.filter((a) => !overflowedMetas.includes(a.meta));
    void ingestFiles(toProcess, setFiles, setError);

    // 0→非ゼロ遷移時のみプレビューエリアへ自動スクロール (現在の操作を邪魔しない)
    if (wasEmpty && mergedMetas.length > 0) {
      requestAnimationFrame(() => {
        previewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const removeFile = useCallback(
    (id: string) => {
      const target = files.find((f) => f.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      setFiles(files.filter((f) => f.id !== id));
      void deletePhotos([id]);
    },
    [files, setFiles],
  );

  const handleLabelClick = () => {
    // モバイルでは写真ピッカーが閉じてから change が発火するまでに「無の期間」がある。
    // change を待つと手遅れになるので、ピッカーを開くタップの瞬間にローダーを立てる。
    setIsImporting(true);
    if (importTimeoutRef.current !== null) {
      window.clearTimeout(importTimeoutRef.current);
    }
    importTimeoutRef.current = window.setTimeout(() => {
      setIsImporting(false);
      importTimeoutRef.current = null;
    }, 60_000);
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setIsImporting(false);
    if (importTimeoutRef.current !== null) {
      window.clearTimeout(importTimeoutRef.current);
      importTimeoutRef.current = null;
    }
    if (e.target.files) addFiles(e.target.files);
    e.target.value = ""; // 同じファイル再選択可
  };

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const credit = form.senderName.trim();
  const hasSenderName = credit.length > 0;
  const exifMode: EmbedMode = receiverOptions?.exif_embed_mode ?? "disabled";
  const watermarkMode: EmbedMode = receiverOptions?.watermark_mode ?? "disabled";
  // 送信者名が必須になる条件:
  // - 受信者が「送信者名の入力を必須」に設定 (R14 require_sender_name、サーバ側でも400)
  // - EXIF埋め込みが required (埋め込む内容が送信者名そのものなので名前なしでは成立しない)
  // 透かし required は自由テキストで成立するため名前は要求しない (非空要素のみ要求)
  const nameRequired = (receiverOptions?.require_sender_name ?? false) || exifMode === "required";
  // required が強制するのは「非空テキストの要素が1つ以上」(R14)。四角形だけでは満たさない
  const watermarkRequiredEmpty =
    watermarkMode === "required" &&
    !resolveWatermarkElements(form.watermarkElements, credit).some((el) => el.kind === "text");
  const canSubmit =
    files.length > 0 &&
    (nameRequired ? hasSenderName : hasSenderName || noCreditConsent) &&
    !watermarkRequiredEmpty;

  const handleSubmit = () => {
    if (!canSubmit) return;
    navigate(withKey(`/send/${handle}/uploading`, accessKey), { replace: true });
  };

  // フォームと受信者モードの整合を取る
  // - EXIF はクレジット (送信者名) しか埋め込めないため senderName 空でフラグを落とす
  // - 透かしは自由テキストで成立するため senderName には依存しない
  useEffect(() => {
    setForm((prev) => {
      let exifEnabled = prev.exifEnabled;
      let watermarkEnabled = prev.watermarkEnabled;
      if (!hasSenderName || exifMode === "disabled") exifEnabled = false;
      else if (exifMode === "required") exifEnabled = true;
      if (watermarkMode === "disabled") watermarkEnabled = false;
      else if (watermarkMode === "required") watermarkEnabled = true;
      if (exifEnabled === prev.exifEnabled && watermarkEnabled === prev.watermarkEnabled) {
        return prev;
      }
      return { ...prev, exifEnabled, watermarkEnabled };
    });
  }, [hasSenderName, exifMode, watermarkMode, setForm]);

  // 透かしダイアログのライブプレビュー用候補。サムネ ObjectURL を渡すだけで実体は持たない。
  // id とサムネ生成状態(空→URL)の両方をシグネチャに含め、サムネ完了が候補に反映される
  // ようにする (含めないと未生成扱いのまま HEIC プレースホルダ等に誤表示される)。
  const previewFilesKey = files.map((f) => `${f.id}:${f.previewUrl ? 1 : 0}`).join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: previewFilesKey が files の identity とサムネ状態を代表する
  const previewCandidates = useMemo(() => buildPreviewCandidates(files), [previewFilesKey]);
  // ダイアログが選択時に実体 File を取り出すためのコールバック。IndexedDB から都度復元する。
  const getPreviewFile = useCallback(
    async (id: string, name: string, type: string): Promise<File> =>
      new File([await getPhoto(id)], name, { type }),
    [],
  );

  // <Trans> / <Plural> のプレースホルダを名前付きにするため、式のまま埋め込まない
  const receiverName = displayName ?? handle ?? "";
  const fileCount = files.length;

  const renderDropZone = (compact: boolean) => (
    <label
      htmlFor="file-input"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`block cursor-pointer rounded-[24px] border-2 border-dashed bg-surface/60 text-center backdrop-blur-sm transition-all ${
        compact ? "p-4 sm:p-6" : "p-10 sm:p-16 lg:p-20"
      } ${
        dragOver
          ? "border-brand bg-brand-tint"
          : "border-surface-sand-deep hover:border-brand/60 hover:bg-surface/80"
      }`}
    >
      <div
        className={`mx-auto flex items-center justify-center rounded-full bg-brand-tint text-brand ${
          compact ? "h-9 w-9" : "h-14 w-14 sm:h-16 sm:w-16"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={compact ? "h-4 w-4" : "h-7 w-7 sm:h-8 sm:w-8"}
          aria-hidden="true"
        >
          {compact ? <path d="M12 5v14M5 12h14" /> : <path d="M12 19V5M5 12l7-7 7 7" />}
        </svg>
      </div>
      <p
        className={`font-semibold tracking-[-0.01em] text-ink ${
          compact ? "mt-2 text-[14px]" : "mt-4 text-[18px] sm:text-[22px]"
        }`}
      >
        {compact ? t`他の写真を追加` : t`写真をここにドロップ`}
      </p>
      <p className={`text-ink-soft ${compact ? "mt-0.5 text-[12px]" : "mt-1 text-[14px]"}`}>
        <Trans>またはタップしてファイルを選択</Trans>
      </p>
      {!compact && (
        <p className="mt-3 font-mono text-[11px] text-ink-muted">
          <Trans>JPEG / PNG / HEIC ・ 最大 20MB / 枚 ・ 100 枚まで</Trans>
        </p>
      )}
    </label>
  );

  return (
    <div className="relative overflow-hidden px-4 py-6 sm:px-6 sm:py-8">
      <SenderAtmosphere tone="warm" />
      {/* label[htmlFor] で関連付けるため、input は DropZone のバリアント切り替えに影響されない位置に 1 度だけ置く。
          onClick はラベル経由のクリックでも発火する (label が input に click を delegate するため)。 */}
      <input
        id="file-input"
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onClick={handleLabelClick}
        onChange={handleFileInputChange}
      />
      <div className="relative z-10 mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-2">
          <Link
            to={withKey(`/send/${handle}`, accessKey)}
            className="rounded-lg px-2 py-1 text-[14px] text-ink-soft transition-colors hover:bg-surface-sand hover:text-ink"
          >
            <Trans>&lt; 戻る</Trans>
          </Link>
          <h1 className="truncate text-[16px] font-semibold text-ink">
            <Trans>{receiverName}さんへ送信</Trans>
          </h1>
          <div className="w-12" />
        </div>

        {files.length === 0 ? (
          renderDropZone(false)
        ) : (
          <>
            <div ref={previewSectionRef}>
              <div className="mb-2 flex items-center justify-between text-[14px]">
                <span className="font-medium text-ink">
                  <Plural value={fileCount} other="#枚選択中" />
                </span>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-ink-soft transition-colors hover:bg-surface-sand hover:text-ink"
                  onClick={() => {
                    for (const f of files) if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
                    void deletePhotos(files.map((f) => f.id));
                    setFiles([]);
                  }}
                >
                  <Trans>すべてクリア</Trans>
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {files.map((f) => (
                  <PreviewTile key={f.id} file={f} onRemove={removeFile} />
                ))}
              </div>
            </div>
            {renderDropZone(true)}
          </>
        )}

        {isImporting && (
          <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-surface-sand-deep bg-surface/80 px-4 py-3 text-[14px] text-ink-soft">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-sand-deep border-t-brand" />
            <span>
              <Trans>写真を取り込み中…</Trans>
            </span>
          </div>
        )}

        <p className="text-center text-[12px] text-ink-soft">
          <Trans>
            初めての方は
            <Link to="/guide" className="ml-0.5 text-brand underline-offset-2 hover:underline">
              使い方を見る →
            </Link>
          </Trans>
        </p>

        {error && (
          <Alert variant="error">
            <div className="whitespace-pre-line">{error}</div>
          </Alert>
        )}

        {files.length > 0 && (
          <div className="mx-auto w-full max-w-3xl">
            <Card>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="senderName"
                    className="flex items-center gap-1.5 text-[14px] font-medium text-ink"
                  >
                    <Trans>送信者名 / TwitterID</Trans>
                    {nameRequired && <RequiredBadge />}
                  </label>
                  <input
                    id="senderName"
                    type="text"
                    value={form.senderName}
                    onChange={(e) => setForm({ ...form, senderName: e.target.value })}
                    placeholder="@your_name"
                    className="block w-full rounded-xl border border-surface-sand-deep bg-surface px-4 py-3 text-[14px] text-ink placeholder:text-ink-muted transition-all focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15"
                  />
                  <p className="text-[13px] text-ink-soft">
                    {exifMode !== "disabled" ? (
                      <Trans>受信者に表示されます。EXIF埋め込みにもこの名前が使われます</Trans>
                    ) : (
                      <Trans>受信者に表示されます</Trans>
                    )}
                  </p>
                  {nameRequired && !hasSenderName && (
                    <p className="text-[13px] text-status-warn">
                      <Trans>この受信者への送信には送信者名の入力が必要です</Trans>
                    </p>
                  )}
                </div>

                {(exifMode !== "disabled" || watermarkMode !== "disabled") && (
                  <div className="space-y-3 border-t border-surface-sand-deep pt-4">
                    {exifMode !== "disabled" && (
                      <label
                        className={`flex items-start gap-2.5 text-[14px] ${hasSenderName ? "" : "opacity-50"}`}
                      >
                        <input
                          type="checkbox"
                          checked={form.exifEnabled}
                          disabled={!hasSenderName || exifMode === "required"}
                          onChange={(e) => setForm({ ...form, exifEnabled: e.target.checked })}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                        />
                        <span>
                          <span className="flex items-center gap-1.5 font-medium text-ink">
                            <Trans>EXIFカメラモデル欄に埋め込む</Trans>
                            {exifMode === "required" && <RequiredBadge />}
                          </span>
                          <span className="mt-0.5 block text-[13px] text-ink-soft">
                            {credit ? (
                              <Trans>
                                メタデータに送信者名
                                <code className="mx-0.5 rounded bg-surface-sand px-1.5 py-0.5 font-mono text-[0.95em] text-ink">
                                  {credit}
                                </code>
                                を書き込みます（元のカメラ情報は上書き）
                              </Trans>
                            ) : (
                              <Trans>
                                メタデータに送信者名を書き込みます（元のカメラ情報は上書き）
                              </Trans>
                            )}
                          </span>
                        </span>
                      </label>
                    )}

                    {watermarkMode !== "disabled" && (
                      <div>
                        <label className="flex items-start gap-2.5 text-[14px]">
                          <input
                            type="checkbox"
                            checked={form.watermarkEnabled}
                            disabled={watermarkMode === "required"}
                            onChange={(e) => {
                              const enabled = e.target.checked;
                              setForm({ ...form, watermarkEnabled: enabled });
                              // ON にしたら必ず編集ダイアログを開き、
                              // 何がどこに焼き込まれるかをその場で確認・調整させる
                              if (enabled) setWatermarkDialogOpen(true);
                            }}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                          />
                          <span>
                            <span className="flex items-center gap-1.5 font-medium text-ink">
                              <Trans>透かしを入れる</Trans>
                              {watermarkMode === "required" && <RequiredBadge />}
                            </span>
                            <span className="mt-0.5 block text-[13px] text-ink-soft">
                              <Trans>
                                画像に文字や四角形を描き込みます（不可逆）。初期設定では送信者名が右下に入り、内容・位置・フォントは自由に編集できます
                              </Trans>
                            </span>
                          </span>
                        </label>
                        {form.watermarkEnabled && (
                          <div className="mt-2 pl-6">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setWatermarkDialogOpen(true)}
                            >
                              <Trans>透かしを編集</Trans>
                            </Button>
                          </div>
                        )}
                        {watermarkRequiredEmpty && (
                          <p className="mt-2 pl-6 text-[13px] text-status-warn">
                            <Trans>
                              透かしに表示できる文字がありません。「透かしを編集」から文字を入力してください。
                            </Trans>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {files.length > 0 && !hasSenderName && !nameRequired && (
          <label className="mx-auto flex w-full max-w-3xl items-start gap-2.5 rounded-2xl border border-status-warn/30 bg-status-warn/10 p-4 text-[13px]">
            <input
              type="checkbox"
              checked={noCreditConsent}
              onChange={(e) => setNoCreditConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-status-warn"
            />
            <span className="text-ink">
              <Trans>
                送信者名を記載しない場合、写真のクレジット表記なしでの編集・共有が行われる可能性があることに同意します
              </Trans>
            </span>
          </label>
        )}

        <div className="mx-auto w-full max-w-3xl">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {fileCount > 0 ? (
              <Plural value={fileCount} other="送信する (#枚)" />
            ) : (
              <Trans>送信する</Trans>
            )}
          </Button>
        </div>

        {files.length > 0 && (
          <p className="mx-auto max-w-3xl text-center text-[12px] leading-relaxed text-ink-soft">
            <Trans>
              送信ボタンを押すと、
              <Link
                to="/terms"
                target="_blank"
                className="text-brand underline-offset-2 hover:underline"
              >
                利用規約
              </Link>
              および
              <Link
                to="/privacy"
                target="_blank"
                className="ml-0.5 text-brand underline-offset-2 hover:underline"
              >
                プライバシーポリシー
              </Link>
              に同意したものとみなされます。
            </Trans>
          </p>
        )}

        <WatermarkDialog
          open={watermarkDialogOpen}
          onClose={() => setWatermarkDialogOpen(false)}
          elements={form.watermarkElements}
          onChange={(els) => setForm((prev) => ({ ...prev, watermarkElements: els }))}
          credit={credit}
          candidates={previewCandidates}
          getFile={getPreviewFile}
        />
      </div>
    </div>
  );
}

function RequiredBadge() {
  return (
    <span className="rounded-md bg-status-warn/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-status-warn">
      <Trans>必須</Trans>
    </span>
  );
}

/** memo: 透かしドラッグ中はフォーム atom が毎フレーム更新されるため、タイル再調停を避ける */
const PreviewTile = memo(function PreviewTile({
  file,
  onRemove,
}: {
  file: SelectedFile;
  onRemove: (id: string) => void;
}) {
  const { t } = useLingui();
  const heic = isHeic(file.file);
  const name = file.file.name;
  const hasPreview = file.previewUrl.length > 0;
  const generating = !file.previewReady;
  return (
    <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-surface-canvas">
      {heic ? (
        <div className="flex flex-col items-center justify-center px-2 text-center text-ink-soft">
          <span className="font-mono text-[13px] font-semibold">HEIC</span>
          <span className="mt-0.5 text-[11px]">
            <Trans>プレビュー不可</Trans>
          </span>
          <span className="mt-1 max-w-full truncate text-[11px]">{file.file.name}</span>
        </div>
      ) : hasPreview ? (
        <img
          src={file.previewUrl}
          alt={file.file.name}
          loading="lazy"
          decoding="async"
          className="max-h-full max-w-full rounded-xl object-contain"
        />
      ) : generating ? (
        <div className="flex flex-col items-center justify-center gap-1.5 px-2 text-center text-[12px] text-ink-soft">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-surface-sand-deep border-t-brand" />
          <span className="max-w-full truncate">{file.file.name}</span>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center px-2 text-center text-[12px] text-ink-soft">
          <span className="font-mono font-semibold">
            <Trans>画像</Trans>
          </span>
          <span className="mt-1 max-w-full truncate">{file.file.name}</span>
        </div>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(file.id);
        }}
        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink/55 text-[13px] text-white backdrop-blur-sm transition-colors hover:bg-ink/75"
        aria-label={t`${name} を削除`}
      >
        ×
      </button>
    </div>
  );
});

type SetFiles = (update: SelectedFile[] | ((prev: SelectedFile[]) => SelectedFile[])) => void;

/** IndexedDB の容量超過エラーか判定する (iOS/各ブラウザ共通で name は QuotaExceededError) */
function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "QuotaExceededError";
}

/**
 * 選択された各ファイルを取り込み、サムネプレビュー (長辺 400px) を生成する。
 *
 * 処理は 2 パス:
 *  1. 各ファイルの bytes を IndexedDB (photo-store) へ書き出す。picker 由来の
 *     File を put すると実体が読まれてストアにコピーされ、content:// から
 *     切り離される。Android Chrome では content:// File が選択時スナップショットを
 *     持ち、遅延読み込み時に失効すると ERR_UPLOAD_FILE_CHANGED / decode 失敗で
 *     全滅するため、低速なデコードより先にここで全件確保する。bytes は state に
 *     持たず IDB (ディスク) に逃がすので RAM も圧迫しない。
 *  2. IDB から 1 枚ずつ取り出して 400px サムネを生成する。オリジナルを `<img>` に
 *     直接渡すと巨大な raw データがデコードされて重いため、表示用は小さくする。
 *     RAM 常駐は同時デコード数ぶんに限られる。
 */
async function ingestFiles(
  items: { meta: SelectedFile; file: File }[],
  setFiles: SetFiles,
  setError: (msg: string | null) => void,
) {
  const applyUpdate = (id: string, patch: Partial<SelectedFile>) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      // 途中で削除/上限オーバー等で外されていたら生成分の URL を解放して無視
      if (!target) {
        if (patch.previewUrl) URL.revokeObjectURL(patch.previewUrl);
        return prev;
      }
      return prev.map((f) => (f.id === id ? { ...f, ...patch } : f));
    });
  };

  const ilog = debugLog.scope("ingest");
  ilog.log(
    `取り込み開始 ${items.length}枚`,
    items.map(({ file }) => ({ name: file.name, type: file.type, size: file.size })),
  );

  // Pass 1: bytes を IndexedDB へ退避し、content:// から切り離す
  const stored = await runConcurrent(items, STORE_CONCURRENCY, async ({ meta, file }) => {
    await withRetry(STORE_RETRIES, () => putPhoto(meta.id, file));
    return meta;
  });
  let quotaHit = false;
  const pendingPreview = stored.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    // IDB 書き出しに失敗したケース。プレビュー不可として確定させる
    if (isQuotaError(r.reason)) quotaHit = true;
    ilog.dumpError(`IndexedDB 退避失敗 (${items[i].meta.file.name})`, r.reason);
    applyUpdate(items[i].meta.id, { previewReady: true });
    return null;
  });
  // iOS など端末の保存容量上限に達した場合は原因が分かる文言を出す
  if (quotaHit) {
    setError(
      globalI18n._(
        msg`端末の保存容量が不足しているため、一部の写真を取り込めませんでした。写真の枚数を減らすか、空き容量を確保してお試しください。`,
      ),
    );
  }

  const renderThumb = async (meta: SelectedFile): Promise<void> => {
    const thumb = await generateThumbnail(await getPhoto(meta.id));
    applyUpdate(meta.id, { previewUrl: URL.createObjectURL(thumb), previewReady: true });
  };

  // Pass 2: IDB から取り出して 1 枚ずつサムネ生成
  // 並列デコードの圧で一過性に失敗したものは、圧が消えた後に逐次で再挑戦する
  const decodeFailed: SelectedFile[] = [];
  await runConcurrent(pendingPreview, PREVIEW_CONCURRENCY, async (meta) => {
    if (!meta) return;
    // HEIC は専用の「プレビュー不可」表示にするため生成試行しない
    if (isHeic(meta.file)) {
      applyUpdate(meta.id, { previewReady: true });
      return;
    }
    try {
      await withRetry(DECODE_RETRIES, () => renderThumb(meta));
    } catch (err) {
      ilog.dumpError(`サムネ生成失敗 (Pass2, ${meta.file.name})、最終スイープに回す`, err);
      decodeFailed.push(meta);
    }
  });
  if (decodeFailed.length > 0) {
    ilog.log(`最終スイープ対象 ${decodeFailed.length}枚`);
  }

  // Pass 3: 最終スイープ。並列デコードが全て終わってメモリ逼迫が解けた状態で、
  // 失敗分を逐次 (並列度1) で 1 回ずつ再試行する。
  for (const meta of decodeFailed) {
    try {
      await renderThumb(meta);
    } catch (err) {
      ilog.dumpError(`サムネ生成失敗 (最終スイープ, ${meta.file.name})、プレビュー不可で確定`, err);
      // 再試行しても生成できなかった確定失敗のみ計測 (iOS OOM デコード等の予兆)
      trackClientError({
        error_kind: "image_processing",
        context: "preview",
        ...extractError(err),
      });
      applyUpdate(meta.id, { previewReady: true });
    }
  }
  ilog.log("取り込み完了");
}
