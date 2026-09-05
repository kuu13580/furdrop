-- 受信者向けメール通知 (R09)。
--
-- users に足さず独立させたのは、認証由来の users.email と役割が違うのと、
-- トークンと有効期限を持つ「検証の状態機械」を users に混ぜると
-- SELECT * FROM users が何の話なのか読めなくなるため。send_keys と同じ判断。
--
-- 行は遅延生成する (通知を設定した人にだけ作られる)。
-- 「行が無い = 未設定」なので、Cron はこのテーブルを読むこと自体が絞り込みになる。
CREATE TABLE notification_settings (
    receiver_id        TEXT PRIMARY KEY REFERENCES users(id),  -- 1:1 を PK で強制

    -- 宛先と検証。email と pending_email を分けているのは、アドレス変更中も
    -- 検証済みの旧アドレスに送り続けるため (変更で通知が黙って止まるほうが事故)
    email              TEXT,     -- 検証済み。NULL なら送らない
    pending_email      TEXT,     -- 検証待ち
    pending_token      TEXT,
    pending_expires    INTEGER,  -- UNIX秒
    unsubscribe_token  TEXT,     -- 検証成立時に発行。RFC 8058 のワンクリック解除で使う

    -- 設定 (ユーザーが書く)
    notify_digest      INTEGER NOT NULL DEFAULT 1,
    notify_expiry      INTEGER NOT NULL DEFAULT 1,
    notify_quota       INTEGER NOT NULL DEFAULT 1,

    -- 確認メールの送信量。1分あたりの制限 (RATE_LIMITER_VERIFY) だけでは、
    -- 攻撃者が 1 アカウントで任意の宛先へ 1日 4,000 通以上を撃てるため日次でも絞る。
    -- ドメインレピュテーションの毀損と、月間クォータ (3,000通) の枯渇を防ぐのが目的。
    verify_window_start INTEGER,                     -- 日次カウンタの窓の開始 (UNIX秒)
    verify_sent_count   INTEGER NOT NULL DEFAULT 0,

    -- 状態 (Cron が書く。ユーザーには見えない)。
    -- 設定と同じカラムに畳むと、通知をオフにした時点で「どこまで通知したか」が消え、
    -- オンに戻したときに同じ警告がもう一度飛ぶ。
    last_digest_at     INTEGER,                     -- 最後にダイジェストを送った時刻
    quota_notice_level INTEGER NOT NULL DEFAULT 0,  -- 0 / 80 / 95

    created_at         INTEGER NOT NULL,
    updated_at         INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_notif_pending_token ON notification_settings(pending_token);
CREATE UNIQUE INDEX idx_notif_unsub_token ON notification_settings(unsubscribe_token);

-- 表示言語。通知の設定ではなく素のユーザー属性なので users に置く
-- (言語トグルは通知未設定の人も押すため、notification_settings に置くと
--  言語を変えただけで通知設定の行ができてしまう)。
-- NULL は送信時に 'ja' として解決する。
ALTER TABLE users ADD COLUMN locale TEXT;
