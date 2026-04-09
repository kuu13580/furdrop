-- 受信者アカウント (Firebase Auth UIDをPKとして使用)
CREATE TABLE users (
    id                TEXT PRIMARY KEY,
    handle            TEXT NOT NULL UNIQUE,
    display_name      TEXT NOT NULL,
    email             TEXT NOT NULL,
    avatar_url        TEXT,
    storage_used      INTEGER NOT NULL DEFAULT 0,
    storage_quota     INTEGER NOT NULL DEFAULT 10737418240,
    is_active         INTEGER NOT NULL DEFAULT 1,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_users_handle ON users(handle);

-- アップロードセッション (複数枚を1セッションにまとめる)
CREATE TABLE upload_sessions (
    id            TEXT PRIMARY KEY,
    receiver_id   TEXT NOT NULL REFERENCES users(id),
    sender_name   TEXT,
    photo_count   INTEGER NOT NULL DEFAULT 0,
    total_size    INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'active',
    expires_at    INTEGER NOT NULL,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);

CREATE INDEX idx_sessions_receiver ON upload_sessions(receiver_id);
CREATE INDEX idx_sessions_expires ON upload_sessions(expires_at);

-- 写真メタデータ
CREATE TABLE photos (
    id                TEXT PRIMARY KEY,
    receiver_id       TEXT NOT NULL REFERENCES users(id),
    session_id        TEXT REFERENCES upload_sessions(id),
    r2_key_original   TEXT NOT NULL UNIQUE,
    r2_key_thumb      TEXT NOT NULL UNIQUE,
    sender_name       TEXT,
    camera_model      TEXT,
    watermark_text    TEXT,
    original_filename TEXT,
    file_size         INTEGER NOT NULL,
    thumb_size        INTEGER NOT NULL DEFAULT 0,
    width             INTEGER,
    height            INTEGER,
    upload_status     TEXT NOT NULL DEFAULT 'pending',
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL
);

CREATE INDEX idx_photos_receiver ON photos(receiver_id, created_at DESC);
CREATE INDEX idx_photos_session ON photos(session_id);
CREATE INDEX idx_photos_status ON photos(receiver_id, upload_status);
