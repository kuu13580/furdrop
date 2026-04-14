import { useAtom } from "jotai";
import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import {
  MAX_FILE_SIZE,
  type WatermarkOptions,
  type WatermarkPosition,
} from "../../lib/image-processing";
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

export default function UploadPage() {
  const { handle } = useParams<{ handle: string }>();
  const navigate = useNavigate();
  const [files, setFiles] = useAtom(selectedFilesAtom);
  const [form, setForm] = useAtom(uploadFormAtom);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [noCreditConsent, setNoCreditConsent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // URLクリーンアップ: コンポーネントunmount時（=確定遷移 or Landingへ戻り）
  // UploadingPageでは引き続きfilesを参照するので、ここでは revoke しない
  useEffect(() => {
    return () => {
      // 送信完了など別フローから戻ってきて再選択する場合はUploadingPageがrevokeする
    };
  }, []);

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

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <Link to={`/send/${handle}`} className="text-sm text-blue-600 hover:underline">
          &lt; 戻る
        </Link>
        <h1 className="text-base font-semibold">{handle}さんへ</h1>
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
          <button
            type="button"
            className="flex w-full items-center justify-between text-left text-sm font-medium text-gray-700"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <span>詳細設定</span>
            <span className="text-gray-400">{showAdvanced ? "▲" : "▼"}</span>
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-4">
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
                <p className="mt-1 text-xs text-gray-500">受信者に表示されます（任意）</p>
              </div>

              <div>
                <label htmlFor="exifText" className="block text-sm font-medium text-gray-700">
                  EXIF送信者情報埋め込み
                </label>
                <input
                  id="exifText"
                  type="text"
                  value={form.exifText}
                  onChange={(e) => setForm({ ...form, exifText: e.target.value })}
                  placeholder="(空欄でEXIF変更なし)"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  EXIFカメラモデル欄に書き込みます。元のカメラ情報は上書きされます
                </p>
              </div>

              <WatermarkSettings
                options={form.watermark}
                onChange={(w) => setForm({ ...form, watermark: w })}
              />
            </div>
          )}
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

const POSITIONS: WatermarkPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

function WatermarkSettings({
  options,
  onChange,
}: {
  options: WatermarkOptions;
  onChange: (next: WatermarkOptions) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="watermarkText" className="block text-sm font-medium text-gray-700">
          透かし（ウォーターマーク）
        </label>
        <input
          id="watermarkText"
          type="text"
          value={options.text}
          onChange={(e) => onChange({ ...options, text: e.target.value })}
          placeholder="(空欄で透かしなし)"
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {options.text && (
        <>
          <div>
            <p className="mb-1 block text-xs font-medium text-gray-600">位置</p>
            <div className="grid w-24 grid-cols-3 gap-1">
              {POSITIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onChange({ ...options, position: p })}
                  aria-label={p}
                  className={`h-6 w-6 rounded-sm border ${
                    options.position === p
                      ? "border-blue-500 bg-blue-500"
                      : "border-gray-300 bg-white hover:bg-gray-100"
                  }`}
                />
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="wmSize" className="block text-xs font-medium text-gray-600">
              サイズ ({(options.fontSizeRatio * 100).toFixed(1)}%)
            </label>
            <input
              id="wmSize"
              type="range"
              min="0.01"
              max="0.05"
              step="0.005"
              value={options.fontSizeRatio}
              onChange={(e) =>
                onChange({ ...options, fontSizeRatio: Number.parseFloat(e.target.value) })
              }
              className="w-full"
            />
          </div>

          <div>
            <label htmlFor="wmOpacity" className="block text-xs font-medium text-gray-600">
              透明度 ({Math.round(options.opacity * 100)}%)
            </label>
            <input
              id="wmOpacity"
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={options.opacity}
              onChange={(e) => onChange({ ...options, opacity: Number.parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>

          <div>
            <p className="mb-1 block text-xs font-medium text-gray-600">色</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...options, color: "#ffffff" })}
                className={`h-7 w-12 rounded border-2 bg-white ${
                  options.color === "#ffffff" ? "border-blue-500" : "border-gray-300"
                }`}
              >
                白
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...options, color: "#000000" })}
                className={`h-7 w-12 rounded border-2 bg-black text-white ${
                  options.color === "#000000" ? "border-blue-500" : "border-gray-700"
                }`}
              >
                黒
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
