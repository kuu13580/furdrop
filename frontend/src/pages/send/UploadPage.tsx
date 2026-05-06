import { useAtom } from "jotai";
import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import SenderAtmosphere from "../../components/send/SenderAtmosphere";
import WatermarkDialog from "../../components/send/WatermarkDialog";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { type EmbedMode, senderApi } from "../../lib/api";
import { runConcurrent } from "../../lib/concurrency";
import {
  CREDIT_FORMATS,
  type CreditFormat,
  formatCredit,
  generateThumbnail,
  MAX_FILE_SIZE,
} from "../../lib/image-processing";
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

const ACCEPTED_EXTS = /\.(jpe?g|png|hei[cf])$/i;

function isAccepted(file: File): boolean {
  const t = file.type.toLowerCase();
  if (t === "image/jpeg" || t === "image/png" || t === "image/heic" || t === "image/heif") {
    return true;
  }
  // ブラウザによってはHEICのMIMEが空になる → 拡張子で判定
  return ACCEPTED_EXTS.test(file.name);
}

function isHeicFile(file: File): boolean {
  const t = file.type.toLowerCase();
  if (t === "image/heic" || t === "image/heif") return true;
  return /\.hei[cf]$/i.test(file.name);
}

/** プレビュー用に使える（HEICではない）最初のファイルを返す */
function findPreviewFile(files: SelectedFile[]): File | null {
  for (const f of files) {
    if (!isHeicFile(f.file)) return f.file;
  }
  return null;
}

export default function UploadPage() {
  const { handle } = useParams<{ handle: string }>();
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const addFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const accepted: SelectedFile[] = [];
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
        id: crypto.randomUUID(),
        file: f,
        previewUrl: "",
        previewReady: false,
      });
    }

    const merged = [...files, ...accepted];
    const overflowed: SelectedFile[] = [];
    if (merged.length > MAX_PHOTOS_PER_SESSION) {
      rejected.push(`一度に送れるのは${MAX_PHOTOS_PER_SESSION}枚までです`);
      overflowed.push(...merged.splice(MAX_PHOTOS_PER_SESSION));
    }
    setFiles(merged);
    setError(rejected.length > 0 ? rejected.join("\n") : null);

    // 上限超過で切り落とされた分は新規生成前なので URL 解放不要
    // 採用分のうちまだ未処理のもののみプレビュー生成
    const toProcess = accepted.filter((a) => !overflowed.includes(a));
    void generatePreviews(toProcess, setFiles);
  };

  const removeFile = (id: string) => {
    const target = files.find((f) => f.id === id);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    setFiles(files.filter((f) => f.id !== id));
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
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
  // 必須モードがある場合は senderName が必須。そうでなければ送信者名なし同意で代替可
  const canSubmit =
    files.length > 0 && (anyRequired ? hasSenderName : hasSenderName || noCreditConsent);

  const handleSubmit = () => {
    if (!canSubmit) return;
    navigate(`/send/${handle}/uploading`, { replace: true });
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

  const previewFile = findPreviewFile(files);

  return (
    <div className="relative overflow-hidden px-4 py-6 sm:px-6 sm:py-8">
      <SenderAtmosphere tone="warm" />
      <div className="relative z-10 mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-2">
          <Link
            to={`/send/${handle}`}
            className="rounded-lg px-2 py-1 text-[14px] text-ink-soft transition-colors hover:bg-surface-sand hover:text-ink"
          >
            &lt; 戻る
          </Link>
          <h1 className="truncate text-[16px] font-semibold text-ink">
            {displayName ?? handle}さんへ送信
          </h1>
          <div className="w-12" />
        </div>

        <label
          htmlFor="file-input"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`block cursor-pointer rounded-[24px] border-2 border-dashed bg-surface/60 p-10 text-center backdrop-blur-sm transition-all sm:p-16 lg:p-20 ${
            dragOver
              ? "border-brand bg-brand-tint"
              : "border-surface-sand-deep hover:border-brand/60 hover:bg-surface/80"
          }`}
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint text-brand sm:h-16 sm:w-16">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-7 w-7 sm:h-8 sm:w-8"
              aria-hidden="true"
            >
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </div>
          <p className="mt-4 text-[18px] font-semibold tracking-[-0.01em] text-ink sm:text-[22px]">
            写真をここにドロップ
          </p>
          <p className="mt-1 text-[14px] text-ink-soft">またはタップしてファイルを選択</p>
          <p className="mt-3 font-mono text-[11px] text-ink-muted">
            JPEG / PNG / HEIC ・ 最大 20MB / 枚 ・ 100 枚まで
          </p>
          <input
            id="file-input"
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
        </label>

        {error && (
          <Alert variant="error">
            <div className="whitespace-pre-line">{error}</div>
          </Alert>
        )}

        {files.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between text-[14px]">
              <span className="font-medium text-ink">{files.length}枚選択中</span>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-ink-soft transition-colors hover:bg-surface-sand hover:text-ink"
                onClick={() => {
                  for (const f of files) if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
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
                      {formatCredit(form.senderName, form.creditFormat) ||
                        CREDIT_FORMATS[form.creditFormat].preview}
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
                            メタデータに「撮影：〜」を書き込みます（元のカメラ情報は上書き）
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
                              画像に「撮影：〜」を描き込みます（不可逆）
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
          previewFile={previewFile}
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
  const heic = isHeicFile(file.file);
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

/**
 * 選択された各ファイルについて非同期にサムネプレビュー (長辺 400px) を生成する。
 * オリジナルを `<img>` に渡すとモバイルで巨大な raw データがデコードされて重くなるため、
 * プレビュー表示に使う画像自体を小さくしておく。
 */
async function generatePreviews(items: SelectedFile[], setFiles: SetFiles) {
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
  await runConcurrent(items, PREVIEW_CONCURRENCY, async (item) => {
    // HEIC は専用の「プレビュー不可」表示にするため生成試行しない
    if (isHeicFile(item.file)) {
      applyUpdate(item.id, { previewReady: true });
      return;
    }
    try {
      const thumb = await generateThumbnail(item.file);
      applyUpdate(item.id, { previewUrl: URL.createObjectURL(thumb), previewReady: true });
    } catch {
      applyUpdate(item.id, { previewReady: true });
    }
  });
}
