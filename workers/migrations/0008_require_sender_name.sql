-- R14: 送信者名の入力を必須にする受信者オプション (0=任意, 1=必須)。
-- EXIF/透かしの埋め込み設定とは独立に「名前だけは必ず欲しい」を表現する。
-- 必須のとき POST /send/:handle/sessions は sender_name 未指定を 400 で拒否する。
ALTER TABLE users ADD COLUMN require_sender_name INTEGER NOT NULL DEFAULT 0;
