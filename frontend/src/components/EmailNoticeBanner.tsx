import { Trans, useLingui } from "@lingui/react/macro";
import { useAtom, useAtomValue } from "jotai";
import { Link } from "react-router";
import { EMAIL_NOTICE_ID, shouldShowEmailNotice } from "../lib/notices";
import { dismissedNoticesAtom } from "../stores/notices";
import { userAtom } from "../stores/user";
import Alert from "./ui/Alert";

/** R09 のリリース告知。期限 (lib/notices.ts) を過ぎたらこのファイルごと消す */
export default function EmailNoticeBanner() {
  const { t } = useLingui();
  const user = useAtomValue(userAtom);
  const [dismissed, setDismissed] = useAtom(dismissedNoticesAtom);

  if (!user) return null;
  const { notification_email: notificationEmail, pending_email: pendingEmail } = user;
  if (!shouldShowEmailNotice({ notificationEmail, pendingEmail, dismissed })) {
    return null;
  }

  return (
    <Alert variant="info">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="font-semibold">
            <Trans>写真が届いたらメールでお知らせできるようになりました</Trans>
          </p>
          <p className="mt-1 text-[13px] leading-[1.5]">
            <Trans>新着のほか、写真の削除予告と保存容量の警告もお送りします。</Trans>{" "}
            <Link to="/settings" className="font-medium underline underline-offset-2">
              <Trans>通知を設定する &rarr;</Trans>
            </Link>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed([...dismissed, EMAIL_NOTICE_ID])}
          aria-label={t`お知らせを閉じる`}
          className="-mr-1 rounded-full px-2 text-[20px] leading-none text-brand-deep/70 transition-colors hover:bg-brand/10 hover:text-brand-deep"
        >
          ×
        </button>
      </div>
    </Alert>
  );
}
