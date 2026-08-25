-- R17 の追いマイグレーション。0010 で require_sender_name への意図の引き継ぎだけを済ませて
-- あり、ここで実際にカラムを落とす。
--
-- 2 段階に分けている理由: CI は migrate → deploy の順に走るので、両カラムを名前で SELECT
-- している旧コードが生きているうちに落とすと /auth/me・/send/:handle・/receiver/photos が
-- 一斉に 500 になり、旧バージョンへのロールバックも不可能になる。0010 を含むバージョンが
-- 本番で稼働していることを確認してからマージする。
ALTER TABLE users DROP COLUMN exif_embed_mode;
ALTER TABLE photos DROP COLUMN camera_model;
