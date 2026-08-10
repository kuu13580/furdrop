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
  exif_embed_mode: EmbedMode;
  watermark_mode: EmbedMode;
  require_sender_name: boolean;
  require_send_key: boolean;
};

export const userAtom = atom<UserProfile | null>(null);
