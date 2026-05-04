import { useAtom, useAtomValue } from "jotai";
import { type SyntheticEvent, useCallback, useState } from "react";
import { Link, useNavigate } from "react-router";
import Alert from "../components/ui/Alert";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import FormField from "../components/ui/FormField";
import StorageQuotaBar from "../components/ui/StorageQuotaBar";
import { ApiError, authApi, type EmbedMode } from "../lib/api";
import { authAtom } from "../stores/auth";
import { suggestedHandleAtom } from "../stores/signup";
import { type UserProfile, userAtom } from "../stores/user";

const HANDLE_REGEX = /^[a-z0-9_]{3,32}$/;

// hintHead と hintTail はモバイルで改行して 2 行表示し、デスクトップでは 1 行に詰める
const EMBED_MODE_OPTIONS: {
  value: EmbedMode;
  label: string;
  hintHead: string;
  hintTail: string;
}[] = [
  { value: "disabled", label: "無効", hintHead: "送信者の", hintTail: "画面に表示しない" },
  { value: "optional", label: "任意", hintHead: "送信者が", hintTail: "選択できる" },
  { value: "required", label: "必須", hintHead: "送信者は", hintTail: "必ず埋め込む" },
];

function EmbedModeRadioGroup({
  name,
  title,
  description,
  value,
  onChange,
  disabled,
}: {
  name: string;
  title: string;
  description: string;
  value: EmbedMode;
  onChange: (next: EmbedMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[14px] font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-[13px] text-ink-soft">{description}</p>
      </div>
      <div
        role="radiogroup"
        aria-label={title}
        className="grid grid-cols-3 gap-1.5 rounded-xl bg-surface-sand p-1"
      >
        {EMBED_MODE_OPTIONS.map((opt) => {
          const checked = value === opt.value;
          return (
            <label
              key={opt.value}
              className={`flex cursor-pointer flex-col items-center rounded-lg px-2 py-2 text-center text-[13px] transition-colors ${
                checked ? "bg-surface text-ink shadow-card" : "text-ink-soft hover:text-ink"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(opt.value)}
                className="sr-only"
              />
              <span className="font-medium">{opt.label}</span>
              <span className="mt-0.5 text-[11px] text-ink-soft">
                {opt.hintHead}
                <br className="sm:hidden" />
                {opt.hintTail}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function RegisterForm() {
  const [authState, setAuth] = useAtom(authAtom);
  const [, setUser] = useAtom(userAtom);
  const [suggestedHandle, setSuggestedHandle] = useAtom(suggestedHandleAtom);
  const navigate = useNavigate();

  const [handle, setHandle] = useState(suggestedHandle ?? "");
  const [displayName, setDisplayName] = useState(
    authState.status === "authenticated" ? (authState.user.displayName ?? "") : "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handleError, setHandleError] = useState<string | null>(null);
  const [exifEmbedMode, setExifEmbedMode] = useState<EmbedMode>("optional");
  const [watermarkMode, setWatermarkMode] = useState<EmbedMode>("disabled");
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const validateHandle = useCallback((value: string) => {
    if (!value) return "ハンドルを入力してください";
    if (!HANDLE_REGEX.test(value)) return "小文字英数字とアンダースコアのみ、3〜32文字";
    return null;
  }, []);

  const handleSubmit = useCallback(
    async (e: SyntheticEvent) => {
      e.preventDefault();

      const hErr = validateHandle(handle);
      if (hErr) {
        setHandleError(hErr);
        return;
      }
      if (!displayName.trim()) {
        setError("表示名を入力してください");
        return;
      }
      if (!agreedToTerms) {
        setError("利用規約とプライバシーポリシーへの同意が必要です");
        return;
      }

      setLoading(true);
      setError(null);
      setHandleError(null);

      try {
        await authApi.register({
          handle,
          display_name: displayName.trim(),
          exif_embed_mode: exifEmbedMode,
          watermark_mode: watermarkMode,
        });
        // registerのレスポンスはUserProfileの全フィールドを含まないのでgetMeで取得
        const { user: profile } = await authApi.getMe();
        setUser(profile);
        if (authState.status === "authenticated") {
          setAuth({ ...authState, registered: true });
        }
        setSuggestedHandle(null);
        navigate("/dashboard", { replace: true });
      } catch (err) {
        if (err instanceof ApiError && err.code === "HANDLE_TAKEN") {
          setHandleError("このハンドルは既に使われています");
        } else {
          setError(
            err instanceof Error ? err.message : "登録に失敗しました。もう一度お試しください",
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [
      handle,
      displayName,
      exifEmbedMode,
      watermarkMode,
      agreedToTerms,
      validateHandle,
      authState,
      setAuth,
      setUser,
      setSuggestedHandle,
      navigate,
    ],
  );

  return (
    <div className="mx-auto max-w-md space-y-6 sm:max-w-xl">
      <div className="text-center">
        <h1 className="text-[22px] font-bold tracking-[-0.015em] text-ink sm:text-[28px]">
          アカウント設定
        </h1>
        <p className="mt-2 text-[14px] text-ink-soft">写真を受け取るための公開URLを作成します</p>
      </div>
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <FormField
            label="ハンドル"
            id="handle"
            value={handle}
            onChange={(e) => {
              setHandle(e.target.value.toLowerCase());
              setHandleError(null);
            }}
            error={handleError ?? undefined}
            hint={`公開URLに使われます: ${window.location.host}/send/あなたのハンドル`}
            placeholder="taro_camera"
            autoComplete="username"
            maxLength={32}
          />
          <FormField
            label="表示名"
            id="display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="太郎カメラ"
            maxLength={50}
          />
          <div className="space-y-4 border-t border-surface-sand-deep pt-4">
            <p className="text-[14px] font-medium text-ink">受信オプション</p>
            <p className="text-[13px] text-ink-soft">
              送信者に提示するオプションを設定します。あとから設定ページで変更できます。
            </p>
            <EmbedModeRadioGroup
              name="register-exif"
              title="EXIF埋め込み"
              description="送信者がカメラモデル欄に名前を書き込みます（メタデータのみ、除去可能）"
              value={exifEmbedMode}
              onChange={setExifEmbedMode}
            />
            <EmbedModeRadioGroup
              name="register-watermark"
              title="透かし"
              description="送信者が画像にクレジットテキストを描き込みます（不可逆）"
              value={watermarkMode}
              onChange={setWatermarkMode}
            />
          </div>
          <label className="flex items-start gap-2.5 border-t border-surface-sand-deep pt-4 text-[13px]">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
            />
            <span className="text-ink">
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
                className="ml-1 text-brand underline-offset-2 hover:underline"
              >
                プライバシーポリシー
              </Link>
              に同意します。
            </span>
          </label>
          <Button
            type="submit"
            loading={loading}
            disabled={!agreedToTerms}
            className="w-full"
            size="lg"
          >
            登録する
          </Button>
        </form>
      </Card>
    </div>
  );
}

function ReceiveOptionsCard({
  user,
  setUser,
}: {
  user: UserProfile;
  setUser: (u: UserProfile) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateMode = useCallback(
    async (field: "exif_embed_mode" | "watermark_mode", value: EmbedMode) => {
      setSaving(true);
      setError(null);
      try {
        await authApi.updateOptions({ [field]: value });
        setUser({ ...user, [field]: value });
      } catch (err) {
        setError(err instanceof Error ? err.message : "更新に失敗しました");
      } finally {
        setSaving(false);
      }
    },
    [user, setUser],
  );

  return (
    <Card title="受信オプション">
      <p className="mb-4 text-[13px] text-ink-soft">
        送信者に提示するオプションを設定します。「必須」にすると送信者は必ず埋め込みます。
      </p>
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}
      <div className="space-y-5">
        <EmbedModeRadioGroup
          name="settings-exif"
          title="EXIF埋め込み"
          description="送信者がカメラモデル欄に名前を書き込みます（メタデータのみ、除去可能）"
          value={user.exif_embed_mode}
          onChange={(v) => updateMode("exif_embed_mode", v)}
          disabled={saving}
        />
        <EmbedModeRadioGroup
          name="settings-watermark"
          title="透かし"
          description="送信者が画像にクレジットテキストを描き込みます（不可逆）"
          value={user.watermark_mode}
          onChange={(v) => updateMode("watermark_mode", v)}
          disabled={saving}
        />
      </div>
    </Card>
  );
}

function ProfileSettings() {
  const [user, setUser] = useAtom(userAtom);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-[22px] font-bold tracking-[-0.015em] text-ink sm:text-[28px]">設定</h1>
      <Card title="プロフィール">
        <dl className="space-y-3 text-[14px]">
          <div>
            <dt className="text-ink-soft">ハンドル</dt>
            <dd className="font-mono font-medium text-ink">{user.handle}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">表示名</dt>
            <dd className="font-medium text-ink">{user.display_name}</dd>
          </div>
        </dl>
      </Card>
      <ReceiveOptionsCard user={user} setUser={setUser} />
      <Card title="ストレージ">
        <StorageQuotaBar used={user.storage_used} quota={user.storage_quota} />
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const authState = useAtomValue(authAtom);

  if (authState.status !== "authenticated") return null;

  return authState.registered ? <ProfileSettings /> : <RegisterForm />;
}
