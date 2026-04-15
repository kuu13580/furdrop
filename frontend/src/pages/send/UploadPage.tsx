import { useAtom } from "jotai";
import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import WatermarkDialog from "../../components/send/WatermarkDialog";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { senderApi } from "../../lib/api";
import { formatCredit, MAX_FILE_SIZE } from "../../lib/image-processing";
import { type SelectedFile, selectedFilesAtom, uploadFormAtom } from "../../stores/sender";

const ACCEPT = "image/jpeg,image/png,image/heic,image/heif,.heic,.heif";
const MAX_PHOTOS_PER_SESSION = 100;

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ヘッダー表示用に受信者のdisplay_nameを取得
  useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    senderApi
      .getReceiver(handle)
      .then((res) => {
        if (!cancelled) setDisplayName(res.receiver.display_name);
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
        previewUrl: isHeicFile(f) ? "" : URL.createObjectURL(f),
      });
    }

    const merged = [...files, ...accepted];
    if (merged.length > MAX_PHOTOS_PER_SESSION) {
      rejected.push(`一度に送れるのは${MAX_PHOTOS_PER_SESSION}枚までです`);
      const overflow = merged.splice(MAX_PHOTOS_PER_SESSION);
      for (const o of overflow) if (o.previewUrl) URL.revokeObjectURL(o.previewUrl);
    }
    setFiles(merged);
    setError(rejected.length > 0 ? rejected.join("\n") : null);
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
  const canSubmit = files.length > 0 && (hasSenderName || noCreditConsent);

  const handleSubmit = () => {
    if (!canSubmit) return;
    navigate(`/send/${handle}/uploading`);
  };

  // 送信者名が消えたら EXIF/透かしの有効フラグも落とす
  useEffect(() => {
    if (!hasSenderName && (form.exifEnabled || form.watermarkEnabled)) {
      setForm({ ...form, exifEnabled: false, watermarkEnabled: false });
    }
  }, [hasSenderName, form, setForm]);

  const previewFile = findPreviewFile(files);

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <Link to={`/send/${handle}`} className="text-sm text-blue-600 hover:underline">
          &lt; 戻る
        </Link>
        <h1 className="text-base font-semibold">{displayName ?? handle}さんへ送信</h1>
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
        className={`block cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-gray-50 hover:bg-gray-100"
        }`}
      >
        <p className="text-sm font-medium text-gray-700">
          ここにドラッグ&ドロップ
          <br />
          またはタップして選択
        </p>
        <p className="mt-2 text-xs text-gray-500">JPEG / PNG / HEIC、最大20MB/枚</p>
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
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">{files.length}枚選択中</span>
            <button
              type="button"
              className="text-gray-500 hover:text-gray-700"
              onClick={() => {
                for (const f of files) if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
                setFiles([]);
              }}
            >
              すべてクリア
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {files.map((f) => (
              <PreviewTile key={f.id} file={f} onRemove={() => removeFile(f.id)} />
            ))}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <Card>
          <div className="space-y-4">
            <div>
              <label htmlFor="senderName" className="block text-sm font-medium text-gray-700">
                送信者名 / TwitterID
              </label>
              <input
                id="senderName"
                type="text"
                value={form.senderName}
                onChange={(e) => setForm({ ...form, senderName: e.target.value })}
                placeholder="@your_name"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                受信者に表示されます。EXIF・透かしには
                <code className="mx-0.5 rounded bg-gray-100 px-1 py-0.5 text-[0.95em]">
                  撮影：{form.senderName.trim() || "〜"}
                </code>
                の形式で埋め込まれます
              </p>
            </div>

            <div className="space-y-3 border-t pt-3">
              <label
                className={`flex items-start gap-2 text-sm ${hasSenderName ? "" : "opacity-50"}`}
              >
                <input
                  type="checkbox"
                  checked={form.exifEnabled}
                  disabled={!hasSenderName}
                  onChange={(e) => setForm({ ...form, exifEnabled: e.target.checked })}
                  className="mt-0.5 shrink-0"
                />
                <span>
                  <span className="font-medium text-gray-700">EXIFカメラモデル欄に埋め込む</span>
                  <span className="mt-0.5 block text-xs text-gray-500">
                    メタデータに「撮影：〜」を書き込みます（元のカメラ情報は上書き）
                  </span>
                </span>
              </label>

              <div>
                <label
                  className={`flex items-start gap-2 text-sm ${hasSenderName ? "" : "opacity-50"}`}
                >
                  <input
                    type="checkbox"
                    checked={form.watermarkEnabled}
                    disabled={!hasSenderName}
                    onChange={(e) => setForm({ ...form, watermarkEnabled: e.target.checked })}
                    className="mt-0.5 shrink-0"
                  />
                  <span>
                    <span className="font-medium text-gray-700">透かしを入れる</span>
                    <span className="mt-0.5 block text-xs text-gray-500">
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
            </div>
          </div>
        </Card>
      )}

      {files.length > 0 && !hasSenderName && (
        <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <input
            type="checkbox"
            checked={noCreditConsent}
            onChange={(e) => setNoCreditConsent(e.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span className="text-amber-800">
            送信者名を記載しない場合、写真のクレジット表記なしでの編集・共有が行われる可能性があることに同意します
          </span>
        </label>
      )}

      <Button
        variant="primary"
        size="lg"
        className="w-full"
        disabled={!canSubmit}
        onClick={handleSubmit}
      >
        送信する{files.length > 0 ? ` (${files.length}枚)` : ""}
      </Button>

      <WatermarkDialog
        open={watermarkDialogOpen}
        onClose={() => setWatermarkDialogOpen(false)}
        options={form.watermark}
        onChange={(w) => setForm({ ...form, watermark: w })}
        text={formatCredit(form.senderName)}
        previewFile={previewFile}
      />
    </div>
  );
}

function PreviewTile({ file, onRemove }: { file: SelectedFile; onRemove: () => void }) {
  const heic = !file.previewUrl;
  return (
    <div className="relative aspect-square overflow-hidden rounded-md bg-gray-100">
      {heic ? (
        <div className="flex h-full w-full flex-col items-center justify-center text-center text-xs text-gray-500">
          <span className="font-mono font-semibold">HEIC</span>
          <span className="mt-1 max-w-full truncate px-1">{file.file.name}</span>
        </div>
      ) : (
        <img src={file.previewUrl} alt={file.file.name} className="h-full w-full object-cover" />
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
        aria-label={`${file.file.name} を削除`}
      >
        ×
      </button>
    </div>
  );
}
