-- バッチ内の送信順を保持するためのインデックス
-- 同一 created_at (秒精度) 内で photos を安定ソートするための tiebreak
-- ギャラリー並び順: ORDER BY created_at DESC, batch_index ASC, id DESC
ALTER TABLE photos ADD COLUMN batch_index INTEGER NOT NULL DEFAULT 0;
