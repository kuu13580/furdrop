import { deleteUser, signOut } from "firebase/auth";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { type SyntheticEvent, useCallback, useState } from "react";
import { Link, useNavigate } from "react-router";
import Alert from "../components/ui/Alert";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Dialog from "../components/ui/Dialog";
import FormField from "../components/ui/FormField";
import StorageQuotaBar from "../components/ui/StorageQuotaBar";
import { ApiError, authApi, type EmbedMode } from "../lib/api";
import { auth } from "../lib/firebase";
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

/** 送信者名必須のトグル (R14)。登録フォームと設定画面で共用する */
function RequireSenderNameField({
  name,
  checked,
  onChange,
  disabled,
}: {
  name: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-2.5 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
      />
      <span>
        <span className="block text-[14px] font-medium text-ink">送信者名の入力を必須にする</span>
        <span className="mt-0.5 block text-[13px] text-ink-soft">
          送信者は名前 (TwitterID等) を入力しないと写真を送れなくなります
        </span>
      </span>
    </label>
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
  const [requireSenderName, setRequireSenderName] = useState(false);
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
          require_sender_name: requireSenderName,
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
      requireSenderName,
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
            <RequireSenderNameField
              name="register-require-name"
              checked={requireSenderName}
              onChange={setRequireSenderName}
            />
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

  const updateOption = useCallback(
    async (patch: {
      exif_embed_mode?: EmbedMode;
      watermark_mode?: EmbedMode;
      require_sender_name?: boolean;
    }) => {
      setSaving(true);
      setError(null);
      try {
        await authApi.updateOptions(patch);
        setUser({ ...user, ...patch });
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
        <RequireSenderNameField
          name="settings-require-name"
          checked={user.require_sender_name}
          onChange={(v) => updateOption({ require_sender_name: v })}
          disabled={saving}
        />
        <EmbedModeRadioGroup
          name="settings-exif"
          title="EXIF埋め込み"
          description="送信者がカメラモデル欄に名前を書き込みます（メタデータのみ、除去可能）"
          value={user.exif_embed_mode}
          onChange={(v) => updateOption({ exif_embed_mode: v })}
          disabled={saving}
        />
        <EmbedModeRadioGroup
          name="settings-watermark"
          title="透かし"
          description="送信者が画像にクレジットテキストを描き込みます（不可逆）"
          value={user.watermark_mode}
          onChange={(v) => updateOption({ watermark_mode: v })}
          disabled={saving}
        />
      </div>
    </Card>
  );
}

function AccountDeletionCard({ user }: { user: UserProfile }) {
  const navigate = useNavigate();
  const setUser = useSetAtom(userAtom);
  const [open, setOpen] = useState(false);
  const [confirmHandle, setConfirmHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    if (loading) return;
    setOpen(false);
    setConfirmHandle("");
    setError(null);
  }, [loading]);

  const handleDelete = useCallback(async () => {
    if (confirmHandle !== user.handle) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Workers 側でアカウント関連データ (photos / sessions / users / R2) を削除
      await authApi.deleteAccount({ confirm_handle: confirmHandle });

      // 2. Firebase Auth ユーザー削除は best-effort。requires-recent-login で失敗しても
      //    Workers データは既に消えており、次回ログイン時 GET /auth/me が 404 になり
      //    登録画面に流れるので「未登録の Firebase ユーザー」と同等扱いになる
      const fbUser = auth.currentUser;
      if (fbUser) {
        await deleteUser(fbUser).catch(() => undefined);
      }

      // 3. ローカル状態クリア + ログアウト
      setUser(null);
      await signOut(auth);

      navigate("/login", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "INVALID_REQUEST") {
        setError("確認用ハンドルが一致しません");
      } else {
        setError(err instanceof Error ? err.message : "削除に失敗しました");
      }
      setLoading(false);
    }
  }, [confirmHandle, user.handle, setUser, navigate]);

  return (
    <>
      <Card title="アカウント削除">
        <p className="mb-4 text-[13px] leading-[1.7] text-ink-soft">
          アカウントと、受信した全ての写真・送信セッション履歴を完全に削除します。
          <br />
          この操作は取り消せません。
        </p>
        <Button variant="danger" onClick={() => setOpen(true)}>
          アカウントを削除
        </Button>
      </Card>
      <Dialog
        open={open}
        onClose={handleClose}
        title="アカウントを削除しますか？"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={handleClose} disabled={loading}>
              キャンセル
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              loading={loading}
              disabled={confirmHandle !== user.handle}
            >
              削除する
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-[14px] leading-[1.7] text-ink">
          <p>以下のデータが完全に削除されます。この操作は取り消せません。</p>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-soft">
            <li>受信した全ての写真とサムネイル</li>
            <li>プロフィール・受信オプション設定</li>
            <li>公開URL ({user.handle}) の所有権</li>
          </ul>
          <p className="text-[12px] leading-[1.6] text-ink-soft">
            ※ 法令遵守 (情プラ法第5条等) のため、送信者の通信記録 (IPアドレス・User-Agent)
            は当該送信から最低3か月の保存期間を経過するまで残ります (利用規約第13条)。
          </p>
          <p className="text-[13px] text-ink-soft">
            続行するには、ご自身のハンドル <code className="font-mono text-ink">{user.handle}</code>{" "}
            を入力してください。
          </p>
          {error && <Alert variant="error">{error}</Alert>}
          <FormField
            label="確認用ハンドル"
            id="confirm-handle"
            value={confirmHandle}
            onChange={(e) => setConfirmHandle(e.target.value)}
            placeholder={user.handle}
            autoComplete="off"
            disabled={loading}
          />
        </div>
      </Dialog>
    </>
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
      <AccountDeletionCard user={user} />
    </div>
  );
}

export default function SettingsPage() {
  const authState = useAtomValue(authAtom);

  if (authState.status !== "authenticated") return null;

  return authState.registered ? <ProfileSettings /> : <RegisterForm />;
}
