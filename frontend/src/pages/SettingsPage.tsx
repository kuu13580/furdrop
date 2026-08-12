import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { deleteUser, signOut } from "firebase/auth";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { type ReactNode, type SyntheticEvent, useCallback, useState } from "react";
import { Link, useNavigate } from "react-router";
import Alert from "../components/ui/Alert";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Dialog from "../components/ui/Dialog";
import FormField from "../components/ui/FormField";
import StorageQuotaBar from "../components/ui/StorageQuotaBar";
import { ApiError, authApi, type EmbedMode } from "../lib/api";
import { resolveApiError } from "../lib/api-error";
import { auth } from "../lib/firebase";
import { authAtom } from "../stores/auth";
import { suggestedHandleAtom } from "../stores/signup";
import { type UserProfile, userAtom } from "../stores/user";

const HANDLE_REGEX = /^[a-z0-9_]{3,32}$/;

// hintHead と hintTail はモバイルで改行して 2 行表示し、デスクトップでは 1 行に詰める。
// 1 行に詰めたとき単語の区切りが要る言語 (en 等) は、hintHead の訳文の末尾に空白を含める
// (日本語は区切りが不要なので、空白の有無は言語ごとの判断になる)
const EMBED_MODE_OPTIONS: {
  value: EmbedMode;
  label: MessageDescriptor;
  hintHead: MessageDescriptor;
  hintTail: MessageDescriptor;
}[] = [
  {
    value: "disabled",
    label: msg`無効`,
    hintHead: msg`送信者の`,
    hintTail: msg`画面に表示しない`,
  },
  { value: "optional", label: msg`任意`, hintHead: msg`送信者が`, hintTail: msg`選択できる` },
  { value: "required", label: msg`必須`, hintHead: msg`送信者は`, hintTail: msg`必ず埋め込む` },
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
  const { i18n } = useLingui();
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
              <span className="font-medium">{i18n._(opt.label)}</span>
              <span className="mt-0.5 text-[11px] text-ink-soft">
                {i18n._(opt.hintHead)}
                <br className="sm:hidden" />
                {i18n._(opt.hintTail)}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function CheckboxField({
  name,
  checked,
  onChange,
  disabled,
  title,
  description,
}: {
  name: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  title: ReactNode;
  description: ReactNode;
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
        <span className="block text-[14px] font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-[13px] text-ink-soft">{description}</span>
      </span>
    </label>
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
    <CheckboxField
      name={name}
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      title={<Trans>送信者名の入力を必須にする</Trans>}
      description={<Trans>送信者は名前 (TwitterID等) を入力しないと写真を送れなくなります</Trans>}
    />
  );
}

function RegisterForm() {
  const { t } = useLingui();
  // t`` のプレースホルダを名前付きにするため、式のまま埋め込まない
  const publicHost = window.location.host;
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

  const validateHandle = useCallback(
    (value: string) => {
      if (!value) return t`ハンドルを入力してください`;
      if (!HANDLE_REGEX.test(value)) return t`小文字英数字とアンダースコアのみ、3〜32文字`;
      return null;
    },
    [t],
  );

  const handleSubmit = useCallback(
    async (e: SyntheticEvent) => {
      e.preventDefault();

      const hErr = validateHandle(handle);
      if (hErr) {
        setHandleError(hErr);
        return;
      }
      if (!displayName.trim()) {
        setError(t`表示名を入力してください`);
        return;
      }
      if (!agreedToTerms) {
        setError(t`利用規約とプライバシーポリシーへの同意が必要です`);
        return;
      }

      setLoading(true);
      setError(null);
      setHandleError(null);

      try {
        const { user: profile } = await authApi.register({
          handle,
          display_name: displayName.trim(),
          exif_embed_mode: exifEmbedMode,
          watermark_mode: watermarkMode,
          require_sender_name: requireSenderName,
        });
        setUser(profile);
        if (authState.status === "authenticated") {
          setAuth({ ...authState, registered: true });
        }
        setSuggestedHandle(null);
        navigate("/dashboard", { replace: true });
      } catch (err) {
        if (err instanceof ApiError && err.code === "HANDLE_TAKEN") {
          setHandleError(t`このハンドルは既に使われています`);
        } else {
          setError(resolveApiError(err, "register"));
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
      t,
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
          <Trans>アカウント設定</Trans>
        </h1>
        <p className="mt-2 text-[14px] text-ink-soft">
          <Trans>写真を受け取るための公開URLを作成します</Trans>
        </p>
      </div>
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <FormField
            label={t`ハンドル`}
            id="handle"
            value={handle}
            onChange={(e) => {
              setHandle(e.target.value.toLowerCase());
              setHandleError(null);
            }}
            error={handleError ?? undefined}
            hint={t`公開URLに使われます: ${publicHost}/send/あなたのハンドル`}
            placeholder="taro_camera"
            autoComplete="username"
            maxLength={32}
          />
          <FormField
            label={t`表示名`}
            id="display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t`太郎カメラ`}
            maxLength={50}
          />
          <div className="space-y-4 border-t border-surface-sand-deep pt-4">
            <p className="text-[14px] font-medium text-ink">
              <Trans>受信オプション</Trans>
            </p>
            <p className="text-[13px] text-ink-soft">
              <Trans>
                送信者に提示するオプションを設定します。あとから設定ページで変更できます。
              </Trans>
            </p>
            <RequireSenderNameField
              name="register-require-name"
              checked={requireSenderName}
              onChange={setRequireSenderName}
            />
            <EmbedModeRadioGroup
              name="register-exif"
              title={t`EXIF埋め込み`}
              description={t`送信者がカメラモデル欄に名前を書き込みます（メタデータのみ、除去可能）`}
              value={exifEmbedMode}
              onChange={setExifEmbedMode}
            />
            <EmbedModeRadioGroup
              name="register-watermark"
              title={t`透かし`}
              description={t`送信者が画像にクレジットテキストを描き込みます（不可逆）`}
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
              <Trans>
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
                  className="text-brand underline-offset-2 hover:underline"
                >
                  プライバシーポリシー
                </Link>
                に同意します。
              </Trans>
            </span>
          </label>
          <Button
            type="submit"
            loading={loading}
            disabled={!agreedToTerms}
            className="w-full"
            size="lg"
          >
            <Trans>登録する</Trans>
          </Button>
        </form>
      </Card>
    </div>
  );
}

function AcceptanceCard({
  user,
  setUser,
}: {
  user: UserProfile;
  setUser: (u: UserProfile) => void;
}) {
  const { t } = useLingui();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // <Trans> のプレースホルダを名前付きにするため、メンバー式のまま埋め込まない
  const handle = user.handle;

  const update = useCallback(
    async (patch: { is_active?: boolean; require_send_key?: boolean }) => {
      setSaving(true);
      setError(null);
      try {
        // レスポンスをそのまま採用する。カードごとに独立した PATCH が飛ぶので、
        // 手元の user にマージすると後着の応答が他方の変更を巻き戻す
        const { user: updated } = await authApi.updateOptions(patch);
        setUser(updated);
      } catch (err) {
        setError(resolveApiError(err, "updateOptions"));
      } finally {
        setSaving(false);
      }
    },
    [setUser],
  );

  const handleOptOut = useCallback(async () => {
    setConfirmOpen(false);
    await update({ require_send_key: false });
  }, [update]);

  return (
    <Card title={t`写真の受付`}>
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}
      <div className="space-y-5">
        <CheckboxField
          name="settings-accepting"
          checked={user.is_active}
          onChange={(v) => update({ is_active: v })}
          disabled={saving}
          title={<Trans>写真を受け付ける</Trans>}
          description={
            <Trans>
              オフにすると受信ページに受付停止中と表示され、新しい写真は届かなくなります
            </Trans>
          }
        />
        <CheckboxField
          name="settings-require-send-key"
          checked={user.require_send_key}
          onChange={(v) => (v ? update({ require_send_key: true }) : setConfirmOpen(true))}
          disabled={saving}
          title={<Trans>受信URLを知っている人だけから受け取る</Trans>}
          description={
            <Trans>
              受信URLの末尾には推測できない文字列が付きます。オフにすると、ハンドルを知っている人なら誰でも写真を送れるようになります
            </Trans>
          }
        />
      </div>
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t`誰でも送れる状態にしますか？`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              <Trans>キャンセル</Trans>
            </Button>
            <Button variant="danger" onClick={handleOptOut}>
              <Trans>誰でも送れるようにする</Trans>
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-[14px] leading-[1.7] text-ink">
          <p>
            <Trans>
              受信URLの末尾の文字列がなくても写真が届くようになり、ハンドル (@{handle})
              を知っている人なら誰でも送信できる状態になります。
            </Trans>
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-soft">
            <li>
              <Trans>
                意図しない写真が届いたときは「写真を受け付ける」をオフにすればすぐ止められます
              </Trans>
            </li>
            <li>
              <Trans>元に戻すと、いまと同じ受信URLがそのまま使えます</Trans>
            </li>
          </ul>
        </div>
      </Dialog>
    </Card>
  );
}

function ReceiveOptionsCard({
  user,
  setUser,
}: {
  user: UserProfile;
  setUser: (u: UserProfile) => void;
}) {
  const { t } = useLingui();
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
        const { user: updated } = await authApi.updateOptions(patch);
        setUser(updated);
      } catch (err) {
        setError(resolveApiError(err, "updateOptions"));
      } finally {
        setSaving(false);
      }
    },
    [setUser],
  );

  return (
    <Card title={t`受信オプション`}>
      <p className="mb-4 text-[13px] text-ink-soft">
        <Trans>
          送信者に提示するオプションを設定します。「必須」にすると送信者は必ず埋め込みます。
        </Trans>
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
          title={t`EXIF埋め込み`}
          description={t`送信者がカメラモデル欄に名前を書き込みます（メタデータのみ、除去可能）`}
          value={user.exif_embed_mode}
          onChange={(v) => updateOption({ exif_embed_mode: v })}
          disabled={saving}
        />
        <EmbedModeRadioGroup
          name="settings-watermark"
          title={t`透かし`}
          description={t`送信者が画像にクレジットテキストを描き込みます（不可逆）`}
          value={user.watermark_mode}
          onChange={(v) => updateOption({ watermark_mode: v })}
          disabled={saving}
        />
      </div>
    </Card>
  );
}

function AccountDeletionCard({ user }: { user: UserProfile }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const setUser = useSetAtom(userAtom);
  const [open, setOpen] = useState(false);
  const [confirmHandle, setConfirmHandle] = useState("");
  // <Trans> のプレースホルダを名前付きにするため、メンバー式のまま埋め込まない
  const handle = user.handle;
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
      setError(resolveApiError(err, "deleteAccount"));
      setLoading(false);
    }
  }, [confirmHandle, user.handle, setUser, navigate]);

  return (
    <>
      <Card title={t`アカウント削除`}>
        <p className="mb-4 text-[13px] leading-[1.7] text-ink-soft">
          <Trans>
            アカウントと、受信した全ての写真・送信セッション履歴を完全に削除します。
            この操作は取り消せません。
          </Trans>
        </p>
        <Button variant="danger" onClick={() => setOpen(true)}>
          <Trans>アカウントを削除</Trans>
        </Button>
      </Card>
      <Dialog
        open={open}
        onClose={handleClose}
        title={t`アカウントを削除しますか？`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={handleClose} disabled={loading}>
              <Trans>キャンセル</Trans>
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              loading={loading}
              disabled={confirmHandle !== user.handle}
            >
              <Trans>削除する</Trans>
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-[14px] leading-[1.7] text-ink">
          <p>
            <Trans>以下のデータが完全に削除されます。この操作は取り消せません。</Trans>
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-soft">
            <li>
              <Trans>受信した全ての写真とサムネイル</Trans>
            </li>
            <li>
              <Trans>プロフィール・受信オプション設定</Trans>
            </li>
            <li>
              <Trans>公開URL ({handle}) の所有権</Trans>
            </li>
          </ul>
          <p className="text-[12px] leading-[1.6] text-ink-soft">
            <Trans>
              ※ 法令遵守 (情プラ法第5条等) のため、送信者の通信記録 (IPアドレス・User-Agent)
              は当該送信から最低3か月の保存期間を経過するまで残ります (利用規約第13条)。
            </Trans>
          </p>
          <p className="text-[13px] text-ink-soft">
            <Trans>
              続行するには、ご自身のハンドル <code className="font-mono text-ink">{handle}</code>{" "}
              を入力してください。
            </Trans>
          </p>
          {error && <Alert variant="error">{error}</Alert>}
          <FormField
            label={t`確認用ハンドル`}
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
  const { t } = useLingui();
  const [user, setUser] = useAtom(userAtom);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-[22px] font-bold tracking-[-0.015em] text-ink sm:text-[28px]">
        <Trans>設定</Trans>
      </h1>
      <Card title={t`プロフィール`}>
        <dl className="space-y-3 text-[14px]">
          <div>
            <dt className="text-ink-soft">
              <Trans>ハンドル</Trans>
            </dt>
            <dd className="font-mono font-medium text-ink">{user.handle}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">
              <Trans>表示名</Trans>
            </dt>
            <dd className="font-medium text-ink">{user.display_name}</dd>
          </div>
        </dl>
      </Card>
      <AcceptanceCard user={user} setUser={setUser} />
      <ReceiveOptionsCard user={user} setUser={setUser} />
      <Card title={t`ストレージ`}>
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
