import { atom } from "jotai";

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
  allow_exif_embed: boolean;
  allow_watermark: boolean;
};

export const userAtom = atom<UserProfile | null>(null);
