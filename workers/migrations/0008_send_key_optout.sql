-- R16 opt-out: 受信URLのアクセスキー検証を受信者の意思で無効化できるようにする。
-- 0 のとき POST /send/:handle/sessions は ?k= を検証せず、handle だけで送信を受け付ける。
-- send_keys のレコードは残すので、再度 1 に戻せば以前と同じ受信URLが復活する。
ALTER TABLE users ADD COLUMN require_send_key INTEGER NOT NULL DEFAULT 1;
