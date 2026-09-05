/**
 * メール送信の隔離層。
 *
 * 送信サービスは Cloudflare Email Service (public beta)。**呼び出し側にはそれを見せない。**
 * beta で GA 未告知・日次クォータ非公開という実在のリスクを抱えて採用しているので、
 * Resend 等へ差し替えるときにこのファイルだけで済むようにしておく。
 *
 * バインディング方式なので API キーが存在しない (.env / deploy-secrets.mjs は無関係)。
 */

import type { Env } from "../types";
import { logError } from "./logger";

/** 送信元。SPF/DKIM/DMARC は Cloudflare が furdrop.app に自動構成する */
const FROM = "FurDrop <notify@furdrop.app>";

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** RFC 8058 のワンクリック解除など */
  headers?: Record<string, string>;
}

/**
 * 1 通送る。失敗しても throw せず false を返す。
 *
 * 通知は「届かなくても写真は失われない」種類の処理なので、1 通の失敗で日次バッチ全体を
 * 止めない。呼び出し側は成否を集計してログに残すだけでよい。
 */
export async function sendMail(
  env: Env,
  mail: OutgoingMail,
  /** ログに残す識別子。宛先そのものは残さない (下記) */
  receiverId?: string,
): Promise<boolean> {
  if (env.ENVIRONMENT !== "production") {
    // ローカル開発で本物のメールを飛ばさない。内容は /dev/emails で確認できる
    console.log(`[mail] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
    recordSentMail(mail);
    return true;
  }

  try {
    await env.EMAIL.send({
      from: FROM,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      headers: mail.headers,
    });
    return true;
  } catch (err) {
    // **宛先そのものはログに残さない。** Workers Logs は「通知メールの送達記録」
    // (プライバシーポリシー第11項・90日) とは別の保存先で、保持期間も別管理になる。
    // どの受信者かは receiver_id から DB を引けば分かる
    logError("mail-send", err, { receiverId, subject: mail.subject });
    return false;
  }
}

/**
 * 非 production で送ったメールの控え。
 *
 * miniflare は send_email バインディングを再現しないので、Workers 統合テストは
 * ここを読んで送信内容を検証する。専用のスパイを製品コードに足すのではなく、
 * dev のために元々ある経路に相乗りしている。
 */
const sentMails: OutgoingMail[] = [];

function recordSentMail(mail: OutgoingMail): void {
  sentMails.push(mail);
  if (sentMails.length > 100) sentMails.shift();
}

export function takeSentMails(): OutgoingMail[] {
  return sentMails.splice(0, sentMails.length);
}
