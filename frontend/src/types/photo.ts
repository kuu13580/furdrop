export type Photo = {
  id: string;
  sender_name: string | null;
  original_filename: string | null;
  file_size: number;
  width: number | null;
  height: number | null;
  thumb_url: string | null;
  /** 詳細表示用オリジナルURL。一覧APIでは付与されない */
  view_url?: string | null;
  created_at: number;
};
