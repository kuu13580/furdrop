-- 送信URLに付与するアクセスキー。1 ユーザー : N キー。
-- 将来の有効期限・名前・無効化フラグ等は必要になった時点で ALTER で追加する。
-- 「無効化」はレコードの削除で表現する (有効=存在 / 無効=削除)。
CREATE TABLE send_keys (
    id            TEXT PRIMARY KEY,
    receiver_id   TEXT NOT NULL REFERENCES users(id),
    key_value     TEXT NOT NULL UNIQUE,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);

CREATE INDEX idx_send_keys_receiver ON send_keys(receiver_id);

-- 既存の全ユーザーに初期キーを1つずつ発行する。
-- SQLite の randomblob() / hex() で 128 bit の乱数を生成 (32文字の小文字 HEX 文字列)。
-- nanoid (21文字, 126 bit) とフォーマットは異なるが URL-safe な乱数として十分。
-- 以降の新規発行は Workers 側の generateSendKey() (URL-safe 21文字) を使う。
INSERT INTO send_keys (id, receiver_id, key_value, created_at, updated_at)
SELECT
    lower(hex(randomblob(16))),
    id,
    lower(hex(randomblob(16))),
    strftime('%s', 'now'),
    strftime('%s', 'now')
FROM users;
