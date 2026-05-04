import { atom } from "jotai";
import type { EmbedMode } from "../lib/api";

export type UserProfile = {
  id: string;
  handle: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  is_active: number;
  storage_used: number;
  storage_quota: number;
  receive_url: string;
  exif_embed_mode: EmbedMode;
  watermark_mode: EmbedMode;
};

export const userAtom = atom<UserProfile | null>(null);
