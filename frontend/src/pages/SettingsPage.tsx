import { useAtom, useAtomValue } from "jotai";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import Alert from "../components/ui/Alert";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import FormField from "../components/ui/FormField";
import StorageQuotaBar from "../components/ui/StorageQuotaBar";
import { ApiError, authApi } from "../lib/api";
import { authAtom } from "../stores/auth";
import { userAtom } from "../stores/user";

const HANDLE_REGEX = /^[a-z0-9_]{3,32}$/;

function RegisterForm() {
  const [authState, setAuth] = useAtom(authAtom);
  const [, setUser] = useAtom(userAtom);
  const navigate = useNavigate();

  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState(
    authState.status === "authenticated" ? (authState.user.displayName ?? "") : "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handleError, setHandleError] = useState<string | null>(null);

  const validateHandle = useCallback((value: string) => {
    if (!value) return "ハンドルを入力してください";
    if (!HANDLE_REGEX.test(value)) return "小文字英数字とアンダースコアのみ、3〜32文字";
    return null;
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
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

      setLoading(true);
      setError(null);
      setHandleError(null);

      try {
        await authApi.register({
          handle,
          display_name: displayName.trim(),
        });
        // registerのレスポンスはUserProfileの全フィールドを含まないのでgetMeで取得
        const { user: profile } = await authApi.getMe();
        setUser(profile);
        if (authState.status === "authenticated") {
          setAuth({ ...authState, registered: true });
        }
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
    [handle, displayName, validateHandle, authState, setAuth, setUser, navigate],
  );

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">アカウント設定</h1>
        <p className="mt-2 text-gray-500">写真を受け取るための公開URLを作成します</p>
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
          <Button type="submit" loading={loading} className="w-full" size="lg">
            登録する
          </Button>
        </form>
      </Card>
    </div>
  );
}

function ProfileSettings() {
  const user = useAtomValue(userAtom);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">設定</h1>
      <Card title="プロフィール">
        <dl className="space-y-3">
          <div>
            <dt className="text-sm text-gray-500">ハンドル</dt>
            <dd className="font-medium">{user.handle}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">表示名</dt>
            <dd className="font-medium">{user.display_name}</dd>
          </div>
        </dl>
      </Card>
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
