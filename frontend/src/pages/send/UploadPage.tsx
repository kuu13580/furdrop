import { useAtom } from "jotai";
import { type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import SenderAtmosphere from "../../components/send/SenderAtmosphere";
import WatermarkDialog from "../../components/send/WatermarkDialog";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { type EmbedMode, senderApi } from "../../lib/api";
import { runConcurrent } from "../../lib/concurrency";
import { debugLog } from "../../lib/debug-log";
import { generateId } from "../../lib/id";
import {
  CREDIT_FORMATS,
  type CreditFormat,
  formatCredit,
  generateThumbnail,
  isHeic,
  MAX_FILE_SIZE,
} from "../../lib/image-processing";
import { clearAllPhotos, deletePhotos, getPhoto, putPhoto } from "../../lib/photo-store";
import { withKey } from "../../lib/send-url";
import { type SelectedFile, selectedFilesAtom, uploadFormAtom } from "../../stores/sender";

const CREDIT_FORMAT_OPTIONS: { value: CreditFormat; label: string }[] = [
  { value: "shot_by", label: CREDIT_FORMATS.shot_by.label },
  { value: "photo_by", label: CREDIT_FORMATS.photo_by.label },
  { value: "copyright", label: CREDIT_FORMATS.copyright.label },
  { value: "name_only", label: CREDIT_FORMATS.name_only.label },
];

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

// 透かしプレビュー候補の最大枚数。実体は IndexedDB から取り出すため、メモリを抑える目的で
// 少数に絞る。WatermarkDialog が先頭から順に decode を試し、最初に成功した 1 枚を使う。
const PREVIEW_CANDIDATE_LIMIT = 6;

/** 透かしプレビュー候補を選ぶ。非HEICを優先し、上限枚数で打ち切る */
function pickPreviewCandidates(files: SelectedFile[]): SelectedFile[] {
  const nonHeic = files.filter((f) => !isHeic(f.file));
  const heic = files.filter((f) => isHeic(f.file));
  return [...nonHeic, ...heic].slice(0, PREVIEW_CANDIDATE_LIMIT);
}

export default function UploadPage() {
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
      if (!isAccepted(f)) {
        rejected.push(`${f.name}: 対応外の形式`);
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        rejected.push(`${f.name}: 20MBを超えています`);
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
      rejected.push(`一度に送れるのは${MAX_PHOTOS_PER_SESSION}枚までです`);
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

  const removeFile = (id: string) => {
    const target = files.find((f) => f.id === id);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    setFiles(files.filter((f) => f.id !== id));
    void deletePhotos([id]);
  };

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

  const hasSenderName = form.senderName.trim().length > 0;
  const exifMode: EmbedMode = receiverOptions?.exif_embed_mode ?? "disabled";
  const watermarkMode: EmbedMode = receiverOptions?.watermark_mode ?? "disabled";
  const anyRequired = exifMode === "required" || watermarkMode === "required";
  // ヘルパーテキストとチェックボックス説明で同じプレビュー文字列を使う
  const creditPreview =
    formatCredit(form.senderName, form.creditFormat) || CREDIT_FORMATS[form.creditFormat].preview;
  // 必須モードがある場合は senderName が必須。そうでなければ送信者名なし同意で代替可
  const canSubmit =
    files.length > 0 && (anyRequired ? hasSenderName : hasSenderName || noCreditConsent);

  const handleSubmit = () => {
    if (!canSubmit) return;
    navigate(withKey(`/send/${handle}/uploading`, accessKey), { replace: true });
  };

  // フォームと受信者モードの整合を取る
  // - mode='disabled' or senderName 空: フラグを落とす
  // - mode='required' で senderName あり: フラグを強制 ON
  // - mode='optional': 送信者の選択を尊重
  useEffect(() => {
    setForm((prev) => {
      let exifEnabled = prev.exifEnabled;
      let watermarkEnabled = prev.watermarkEnabled;
      if (!hasSenderName || exifMode === "disabled") exifEnabled = false;
      else if (exifMode === "required") exifEnabled = true;
      if (!hasSenderName || watermarkMode === "disabled") watermarkEnabled = false;
      else if (watermarkMode === "required") watermarkEnabled = true;
      if (exifEnabled === prev.exifEnabled && watermarkEnabled === prev.watermarkEnabled) {
        return prev;
      }
      return { ...prev, exifEnabled, watermarkEnabled };
    });
  }, [hasSenderName, exifMode, watermarkMode, setForm]);

  // 透かしダイアログのライブプレビュー用。実体は IndexedDB にあるので、ダイアログを
  // 開いている間だけ候補数枚を取り出し、名前を保持するため File に復元して渡す。
  // id 集合のシグネチャで identity を追跡し、別タイルのプレビュー生成完了による
  // 再 fetch を避ける。
  const previewFilesKey = files.map((f) => f.id).join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: previewFilesKey が files の identity を代表する
  const previewCandidates = useMemo(() => pickPreviewCandidates(files), [previewFilesKey]);
  const [previewFiles, setPreviewFiles] = useState<File[]>([]);
  useEffect(() => {
    if (!watermarkDialogOpen) {
      setPreviewFiles([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const out: File[] = [];
      for (const c of previewCandidates) {
        try {
          const blob = await getPhoto(c.id);
          out.push(new File([blob], c.file.name, { type: c.file.type }));
        } catch {
          // 取り出せない候補はスキップし、残りの候補でプレビューを試みる
        }
      }
      if (!cancelled) setPreviewFiles(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [watermarkDialogOpen, previewCandidates]);

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
        {compact ? "他の写真を追加" : "写真をここにドロップ"}
      </p>
      <p className={`text-ink-soft ${compact ? "mt-0.5 text-[12px]" : "mt-1 text-[14px]"}`}>
        またはタップしてファイルを選択
      </p>
      {!compact && (
        <p className="mt-3 font-mono text-[11px] text-ink-muted">
          JPEG / PNG / HEIC ・ 最大 20MB / 枚 ・ 100 枚まで
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
            &lt; 戻る
          </Link>
          <h1 className="truncate text-[16px] font-semibold text-ink">
            {displayName ?? handle}さんへ送信
          </h1>
          <div className="w-12" />
        </div>

        {files.length === 0 ? (
          renderDropZone(false)
        ) : (
          <>
            <div ref={previewSectionRef}>
              <div className="mb-2 flex items-center justify-between text-[14px]">
                <span className="font-medium text-ink">{files.length}枚選択中</span>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-ink-soft transition-colors hover:bg-surface-sand hover:text-ink"
                  onClick={() => {
                    for (const f of files) if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
                    void deletePhotos(files.map((f) => f.id));
                    setFiles([]);
                  }}
                >
                  すべてクリア
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {files.map((f) => (
                  <PreviewTile key={f.id} file={f} onRemove={() => removeFile(f.id)} />
                ))}
              </div>
            </div>
            {renderDropZone(true)}
          </>
        )}

        {isImporting && (
          <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-surface-sand-deep bg-surface/80 px-4 py-3 text-[14px] text-ink-soft">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-sand-deep border-t-brand" />
            <span>写真を取り込み中…</span>
          </div>
        )}

        <p className="text-center text-[12px] text-ink-soft">
          初めての方は
          <Link to="/guide" className="ml-0.5 text-brand underline-offset-2 hover:underline">
            使い方を見る →
          </Link>
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
                  <label htmlFor="senderName" className="block text-[14px] font-medium text-ink">
                    送信者名 / TwitterID
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
                    受信者に表示されます。EXIF・透かしには
                    <code className="mx-0.5 rounded bg-surface-sand px-1.5 py-0.5 font-mono text-[0.95em] text-ink">
                      {creditPreview}
                    </code>
                    の形式で埋め込まれます
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="block text-[13px] font-medium text-ink-soft">クレジット表記</p>
                  <div
                    role="radiogroup"
                    aria-label="クレジット表記"
                    className="grid grid-cols-2 gap-1 rounded-xl bg-surface-sand p-1 sm:grid-cols-4"
                  >
                    {CREDIT_FORMAT_OPTIONS.map((opt) => {
                      const active = form.creditFormat === opt.value;
                      return (
                        <label
                          key={opt.value}
                          className={`flex cursor-pointer items-center justify-center rounded-lg px-2 py-1.5 text-center text-[13px] transition-colors ${
                            active
                              ? "bg-surface text-ink shadow-card"
                              : "text-ink-soft hover:text-ink"
                          }`}
                        >
                          <input
                            type="radio"
                            name="credit-format"
                            value={opt.value}
                            checked={active}
                            onChange={() => setForm({ ...form, creditFormat: opt.value })}
                            className="sr-only"
                          />
                          {opt.label}
                        </label>
                      );
                    })}
                  </div>
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
                            EXIFカメラモデル欄に埋め込む
                            {exifMode === "required" && <RequiredBadge />}
                          </span>
                          <span className="mt-0.5 block text-[13px] text-ink-soft">
                            メタデータに「{creditPreview}」を書き込みます（元のカメラ情報は上書き）
                          </span>
                        </span>
                      </label>
                    )}

                    {watermarkMode !== "disabled" && (
                      <div>
                        <label
                          className={`flex items-start gap-2.5 text-[14px] ${hasSenderName ? "" : "opacity-50"}`}
                        >
                          <input
                            type="checkbox"
                            checked={form.watermarkEnabled}
                            disabled={!hasSenderName || watermarkMode === "required"}
                            onChange={(e) =>
                              setForm({ ...form, watermarkEnabled: e.target.checked })
                            }
                            className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                          />
                          <span>
                            <span className="flex items-center gap-1.5 font-medium text-ink">
                              透かしを入れる
                              {watermarkMode === "required" && <RequiredBadge />}
                            </span>
                            <span className="mt-0.5 block text-[13px] text-ink-soft">
                              画像に「{creditPreview}」を描き込みます（不可逆）
                            </span>
                          </span>
                        </label>
                        {form.watermarkEnabled && hasSenderName && (
                          <div className="mt-2 pl-6">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setWatermarkDialogOpen(true)}
                            >
                              透かしを編集
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {anyRequired && !hasSenderName && (
                      <p className="text-[13px] text-status-warn">
                        この受信者は埋め込みを必須に設定しています。送信者名を入力してください。
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {files.length > 0 && !hasSenderName && !anyRequired && (
          <label className="mx-auto flex w-full max-w-3xl items-start gap-2.5 rounded-2xl border border-status-warn/30 bg-status-warn/10 p-4 text-[13px]">
            <input
              type="checkbox"
              checked={noCreditConsent}
              onChange={(e) => setNoCreditConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-status-warn"
            />
            <span className="text-ink">
              送信者名を記載しない場合、写真のクレジット表記なしでの編集・共有が行われる可能性があることに同意します
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
            送信する{files.length > 0 ? ` (${files.length}枚)` : ""}
          </Button>
        </div>

        {files.length > 0 && (
          <p className="mx-auto max-w-3xl text-center text-[12px] leading-relaxed text-ink-soft">
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
              className="mx-0.5 text-brand underline-offset-2 hover:underline"
            >
              プライバシーポリシー
            </Link>
            に同意したものとみなされます。
          </p>
        )}

        <WatermarkDialog
          open={watermarkDialogOpen}
          onClose={() => setWatermarkDialogOpen(false)}
          options={form.watermark}
          onChange={(w) => setForm({ ...form, watermark: w })}
          text={formatCredit(form.senderName, form.creditFormat)}
          previewFiles={previewFiles}
        />
      </div>
    </div>
  );
}

function RequiredBadge() {
  return (
    <span className="rounded-md bg-status-warn/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-status-warn">
      必須
    </span>
  );
}

function PreviewTile({ file, onRemove }: { file: SelectedFile; onRemove: () => void }) {
  const heic = isHeic(file.file);
  const hasPreview = file.previewUrl.length > 0;
  const generating = !file.previewReady;
  return (
    <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-surface-canvas">
      {heic ? (
        <div className="flex flex-col items-center justify-center px-2 text-center text-ink-soft">
          <span className="font-mono text-[13px] font-semibold">HEIC</span>
          <span className="mt-0.5 text-[11px]">プレビュー不可</span>
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
          <span className="font-mono font-semibold">画像</span>
          <span className="mt-1 max-w-full truncate">{file.file.name}</span>
        </div>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink/55 text-[13px] text-white backdrop-blur-sm transition-colors hover:bg-ink/75"
        aria-label={`${file.file.name} を削除`}
      >
        ×
      </button>
    </div>
  );
}

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
      "端末の保存容量が不足しているため、一部の写真を取り込めませんでした。写真の枚数を減らすか、空き容量を確保してお試しください。",
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
      applyUpdate(meta.id, { previewReady: true });
    }
  }
  ilog.log("取り込み完了");
}
