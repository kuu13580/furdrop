-- R13/X11: DL期限による自動削除
-- NULLの場合はデフォルト (created_at + 30日) として扱う
ALTER TABLE photos ADD COLUMN expires_at INTEGER;

CREATE INDEX idx_photos_expires ON photos(expires_at);
