-- R17: EXIF への送信者情報埋め込みを「送信者が選ぶ」から「受信者が DL 時に選ぶ」へ移行する。
-- 埋め込みは受信者ブラウザ / Workers で DL 時に行うため、送信者側の設定 (users.exif_embed_mode) と
-- アップロード時に焼き込んだ内容の記録 (photos.camera_model) はどちらも不要になる。

-- exif_embed_mode = 'required' は「クレジットを必ず残したい」= 送信者名を必ず取りたい設定だった。
-- その意図を require_sender_name に引き継ぐ。
UPDATE users SET require_sender_name = 1 WHERE exif_embed_mode = 'required';

-- 不要になった exif_embed_mode / camera_model の DROP COLUMN はここでは行わず、
-- 新コードが本番で稼働したあとの追いマイグレーションに分ける。CI は migrate → deploy の
-- 順に走るので、旧コード (両カラムを名前で SELECT している) が生きているうちに落とすと
-- /auth/me・/send/:handle・/receiver/photos が一斉に 500 になり、旧バージョンへの
-- ロールバックも不可能になる。どちらのカラムも残しても新コードは触らないので無害
-- (exif_embed_mode は NOT NULL DEFAULT 'disabled'、camera_model は NULL 許容)。
