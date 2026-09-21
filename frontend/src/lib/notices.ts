/**
 * 期間限定のお知らせ (R09 のリリース告知)。
 * 期限を過ぎたら誰にも出なくなるので、その時点で本ファイルと `EmailNoticeBanner` ごと削除する。
 */
export const EMAIL_NOTICE_ID = "email-notification";

/** 出すのは 2027-03-22 (JST) いっぱいまで */
const EMAIL_NOTICE_UNTIL = Date.UTC(2027, 2, 22, 15);

type EmailNoticeInput = {
  notificationEmail: string | null;
  pendingEmail: string | null;
  dismissed: string[];
  now?: number;
};

/**
 * 写真がまだ0枚の人にも出す。これから受け取る人こそ、届く前に知っておきたい。
 */
export function shouldShowEmailNotice({
  notificationEmail,
  pendingEmail,
  dismissed,
  now = Date.now(),
}: EmailNoticeInput): boolean {
  if (notificationEmail !== null || pendingEmail !== null) return false;
  if (dismissed.includes(EMAIL_NOTICE_ID)) return false;
  return now < EMAIL_NOTICE_UNTIL;
}
