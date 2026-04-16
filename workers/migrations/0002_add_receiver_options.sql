-- R14: 受信オプション設定
-- 送信者に提示するオプション（EXIF埋め込み・透かし）を受信者が制御できるようにする
ALTER TABLE users ADD COLUMN allow_exif_embed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN allow_watermark INTEGER NOT NULL DEFAULT 0;
