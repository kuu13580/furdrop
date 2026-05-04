-- R14: 受信オプションを「許可/拒否」の2値から「無効/任意/必須」の3値に拡張
-- 'disabled' : 送信者UIに表示しない（既存の allow_*=0 相当）
-- 'optional' : 送信者が任意で有効化できる（既存の allow_*=1 相当）
-- 'required' : 送信者は必ず埋め込む（新規モード）
ALTER TABLE users ADD COLUMN exif_embed_mode TEXT NOT NULL DEFAULT 'disabled';
ALTER TABLE users ADD COLUMN watermark_mode TEXT NOT NULL DEFAULT 'disabled';

UPDATE users
   SET exif_embed_mode = CASE WHEN allow_exif_embed = 1 THEN 'optional' ELSE 'disabled' END,
       watermark_mode  = CASE WHEN allow_watermark  = 1 THEN 'optional' ELSE 'disabled' END;

ALTER TABLE users DROP COLUMN allow_exif_embed;
ALTER TABLE users DROP COLUMN allow_watermark;
