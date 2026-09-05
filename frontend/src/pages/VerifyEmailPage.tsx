import { Trans } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import Alert from "../components/ui/Alert";
import Card from "../components/ui/Card";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import { ApiError, notificationApi } from "../lib/api";

type State =
  | { status: "verifying" }
  | { status: "done"; email: string }
  | { status: "expired" }
  | { status: "invalid" };

/**
 * 確認メールのリンク先 (S13)。
 *
 * **ログインしている前提を置かない** — メールアプリから踏まれるので、認証は要求せず
 * トークンだけで検証する。開いた瞬間に検証してよいのは、解除と違って
 * 「勝手に有効化される」害が無いため (むしろリンクを開くこと自体が意思表示)。
 */
export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>({ status: "verifying" });
  // React 18 の StrictMode は effect を 2 回走らせる。トークンは使い捨てなので、
  // 素直に書くと 2 回目が 404 になり「無効なリンク」と表示されてしまう。
  // **トークン単位**で抑止するのは、別のトークンで開き直したときに検証されなく
  // なるのを避けるため (真偽値だとマウント中ずっと塞がる)
  const startedToken = useRef<string | null>(null);
  // 古いリクエストの結果を捨てる判定に使う。**cleanup でキャンセルしてはいけない** —
  // StrictMode は effect を 実行→cleanup→実行 と回すので、cleanup で殺すと
  // 1 回目のリクエストが無効化され、2 回目は上のガードで早期 return して
  // 「確認しています…」のまま固まる
  const latestToken = useRef(token);
  latestToken.current = token;

  useEffect(() => {
    if (startedToken.current === token) return;
    startedToken.current = token;

    if (!token) {
      setState({ status: "invalid" });
      return;
    }

    setState({ status: "verifying" });
    notificationApi
      .verifyEmail(token)
      .then(({ email }) => {
        if (latestToken.current === token) setState({ status: "done", email });
      })
      .catch((err) => {
        if (latestToken.current !== token) return;
        setState({ status: err instanceof ApiError && err.status === 410 ? "expired" : "invalid" });
      });
  }, [token]);

  return (
    <div className="mx-auto max-w-md space-y-6 py-8">
      <h1 className="text-[22px] font-bold tracking-[-0.015em] text-ink sm:text-[28px]">
        <Trans>メールアドレスの確認</Trans>
      </h1>
      <Card>
        {state.status === "verifying" && (
          <div className="flex items-center gap-3 text-[14px] text-ink-soft">
            <LoadingSpinner size="sm" />
            <Trans>確認しています…</Trans>
          </div>
        )}

        {state.status === "done" && (
          <>
            <Alert variant="success">
              <p className="font-semibold">
                <Trans>メールアドレスを確認しました</Trans>
              </p>
              <p className="mt-1 text-[13px]">
                <Trans>これから、このアドレスに通知が届きます。</Trans>
              </p>
            </Alert>
            <p className="mt-3 break-all text-[14px] font-medium text-ink">{state.email}</p>
          </>
        )}

        {state.status === "expired" && (
          <Alert variant="warn">
            <p className="font-semibold">
              <Trans>リンクの有効期限が切れています</Trans>
            </p>
            <p className="mt-1 text-[13px]">
              <Trans>
                確認リンクは発行から24時間で無効になります。設定画面からもう一度アドレスを保存すると、新しい確認メールが届きます。
              </Trans>
            </p>
          </Alert>
        )}

        {state.status === "invalid" && (
          <Alert variant="error">
            <p className="font-semibold">
              <Trans>このリンクは使用できません</Trans>
            </p>
            <p className="mt-1 text-[13px]">
              <Trans>
                すでに確認が済んでいるか、リンクが正しくありません。設定画面で現在の状態を確認してください。
              </Trans>
            </p>
          </Alert>
        )}

        {state.status !== "verifying" && (
          <p className="mt-4 text-[14px]">
            <Link to="/settings" className="font-medium text-brand underline underline-offset-2">
              <Trans>通知の設定を開く &rarr;</Trans>
            </Link>
          </p>
        )}
      </Card>
    </div>
  );
}
