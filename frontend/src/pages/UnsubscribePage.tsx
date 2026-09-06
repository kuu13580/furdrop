import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router";
import Alert from "../components/ui/Alert";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import { notificationApi } from "../lib/api";

/**
 * メールフッターの解除リンク先 (S14)。
 *
 * **開いただけでは解除しない。確認ボタンを押させる。** 企業のメールセキュリティスキャナは
 * 本文中のリンクを自動巡回するので、開いた瞬間に解除すると本人の意思と関係なく解除される。
 * RFC 8058 のワンクリック解除 (`POST /notifications/unsubscribe`) はメールクライアントしか
 * 叩かないので、そちらは即時解除でよい。
 */
export default function UnsubscribePage() {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const token = params.get("t") ?? "";
  const kind = params.get("k") ?? "";
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  const kindLabel = (
    {
      digest: t`新着写真のお知らせ`,
      expiry: t`写真の削除予告`,
      quota: t`保存容量の警告`,
    } as Record<string, string>
  )[kind];

  const submit = useCallback(async () => {
    setState("sending");
    try {
      await notificationApi.unsubscribe(token, kind);
      setState("done");
    } catch {
      setState("error");
    }
  }, [token, kind]);

  const invalid = !token || !kindLabel;

  return (
    <div className="mx-auto max-w-md space-y-6 py-8">
      <h1 className="text-[22px] font-bold tracking-[-0.015em] text-ink sm:text-[28px]">
        <Trans>通知の配信停止</Trans>
      </h1>
      <Card>
        {invalid && (
          <Alert variant="error">
            <p className="font-semibold">
              <Trans>このリンクは使用できません</Trans>
            </p>
            <p className="mt-1 text-[13px]">
              <Trans>設定画面から通知のオン/オフを変更できます。</Trans>
            </p>
          </Alert>
        )}

        {!invalid && state !== "done" && (
          <>
            <p className="text-[14px] leading-[1.7] text-ink">
              <Trans>次の通知の配信を停止します。</Trans>
            </p>
            <p className="mt-2 text-[16px] font-semibold text-ink">{kindLabel}</p>
            <p className="mt-2 text-[13px] text-ink-soft">
              <Trans>ほかの種類の通知は、これまでどおり届きます。</Trans>
            </p>
            {state === "error" && (
              <Alert variant="error" className="mt-4">
                <Trans>停止できませんでした。時間をおいて試してください。</Trans>
              </Alert>
            )}
            <Button
              type="button"
              className="mt-4"
              onClick={submit}
              loading={state === "sending"}
              disabled={state === "sending"}
            >
              <Trans>配信を停止する</Trans>
            </Button>
          </>
        )}

        {state === "done" && (
          <>
            <Alert variant="success">
              <p className="font-semibold">
                <Trans>配信を停止しました</Trans>
              </p>
              <p className="mt-1 text-[13px]">
                <Trans>ほかの種類の通知は、これまでどおり届きます。</Trans>
              </p>
            </Alert>
            <p className="mt-3 text-[14px]">
              <Link to="/settings" className="font-medium text-brand underline underline-offset-2">
                <Trans>通知の設定を開く &rarr;</Trans>
              </Link>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
