export type Photo = {
  id: string;
  sender_name: string | null;
  file_size: number;
  width: number | null;
  height: number | null;
  thumb_url: string | null;
  /** 詳細表示用オリジナルURL。一覧APIでは付与されない */
  view_url?: string | null;
  created_at: number;
  /** DL 期限 (R13) の実効値。サーバーが旧データを解決済みなので常に非 null */
  expires_at: number;
};
