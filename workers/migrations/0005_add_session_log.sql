-- 発信者情報開示請求対応のため、送信者の通信記録を upload_sessions に保存
-- 保存期間は最低3か月（Cron Trigger で100日経過後にクリア）。利用規約 第13条 / プライバシーポリシー 第11項参照
ALTER TABLE upload_sessions ADD COLUMN sender_ip TEXT;
ALTER TABLE upload_sessions ADD COLUMN sender_ua TEXT;
