import { atom } from "jotai";
import type { EmbedMode } from "../lib/api";

export type UserProfile = {
  id: string;
  handle: string;
  display_name: string;
  storage_used: number;
  storage_quota: number;
  receive_url: string;
  is_active: boolean;
  watermark_mode: EmbedMode;
  require_sender_name: boolean;
  require_send_key: boolean;
  /** R09 通知設定。検証済みの宛先。null なら通知は届かない */
  notification_email: string | null;
  /** 検証待ちの宛先。確認メールのリンクを開くまでこちらに留まる */
  pending_email: string | null;
  notify_digest: boolean;
  notify_expiry: boolean;
  notify_quota: boolean;
  /** サーバーが保存している表示言語。メールの言語判定に使う */
  locale: "ja" | "en" | null;
};

export const userAtom = atom<UserProfile | null>(null);
