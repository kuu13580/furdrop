#!/usr/bin/env node
/**
 * ローカル開発用シードスクリプト
 *
 * ローカル D1 にダミー写真データを投入し、ローカル R2 にテスト画像を配置する。
 * Workers の開発用画像プロキシ (/dev/images/*) 経由でサムネイルが表示される。
 *
 * 前提:
 *   - pnpm generate 済み（wrangler.toml が存在すること）
 *
 * Usage: pnpm seed [--handle <handle>] [--uid <firebase-uid>] [count]
 *
 *   --handle  受信者のハンドル（未登録なら自動作成）
 *   --uid     Firebase UID（--handle で自動作成時に使用。省略時はダミーUID）
 *   count     写真枚数（デフォルト10、最大50）
 *
 * Examples:
 *   pnpm seed                           # 既存ユーザーに10枚
 *   pnpm seed 20                        # 既存ユーザーに20枚
 *   pnpm seed --handle taro_camera      # taro_camera を作成して10枚
 *   pnpm seed --handle taro_camera 20   # taro_camera に20枚
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { join } from "node:path";

// --- 引数パース ---
const args = process.argv.slice(2);
let handleArg = null;
let uidArg = null;
let countArg = 10;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--handle" && args[i + 1]) {
    handleArg = args[++i];
  } else if (args[i] === "--uid" && args[i + 1]) {
    uidArg = args[++i];
  } else if (/^\d+$/.test(args[i])) {
    countArg = Number.parseInt(args[i], 10);
  }
}

const COUNT = Math.min(countArg, 50);
const WORKERS_DIR = join(import.meta.dirname, "..", "workers");

// SQLインジェクション防止: handle/uidは英数字+アンダースコアのみ許可
function sanitize(value, label) {
  if (!/^[a-z0-9_\-@.]+$/i.test(value)) {
    console.error(`Invalid ${label}: ${value} (alphanumeric, _, -, @, . only)`);
    process.exit(1);
  }
  return value;
}
if (handleArg) handleArg = sanitize(handleArg, "handle");
if (uidArg) uidArg = sanitize(uidArg, "uid");
const PLACEHOLDER_PATH = join(import.meta.dirname, "placeholder.jpg");
const PLACEHOLDER_SIZE = statSync(PLACEHOLDER_PATH).size;

/** wrangler d1 execute --local でSELECTクエリを実行 */
function queryD1(sql) {
  const raw = execSync(
    `pnpm exec wrangler d1 execute furdrop --local --command ${JSON.stringify(sql)} --json`,
    { cwd: WORKERS_DIR, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
  );
  const parsed = JSON.parse(raw);
  return parsed[0]?.results ?? [];
}

/** wrangler d1 execute --local でINSERT/UPDATEを実行 */
function executeD1(sql) {
  execSync(`pnpm exec wrangler d1 execute furdrop --local --command ${JSON.stringify(sql)}`, {
    cwd: WORKERS_DIR,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/** wrangler r2 object put --local でローカルR2にアップロード */
function uploadR2(bucket, key, filePath) {
  execSync(
    `pnpm exec wrangler r2 object put "${bucket}/${key}" --file "${filePath}" --content-type image/jpeg --local`,
    { cwd: WORKERS_DIR, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
  );
}

/** ユーザーを取得、または作成 */
function resolveUser() {
  // --handle 指定あり → そのハンドルで検索
  if (handleArg) {
    const rows = queryD1(`SELECT id, handle FROM users WHERE handle = '${handleArg}'`);
    if (rows.length > 0) return rows[0];

    // 存在しない → 自動作成
    const uid = uidArg ?? `test-uid-${handleArg}`;
    const now = Math.floor(Date.now() / 1000);
    executeD1(
      `INSERT INTO users (id, handle, display_name, email, avatar_url, storage_used, storage_quota, is_active, created_at, updated_at) VALUES ('${uid}', '${handleArg}', '${handleArg}', '${handleArg}@test.local', NULL, 0, 10737418240, 1, ${now}, ${now})`,
    );
    console.log(`Created user: @${handleArg} (uid: ${uid})`);
    return { id: uid, handle: handleArg };
  }

  // --handle なし → 既存ユーザーから取得
  const rows = queryD1("SELECT id, handle FROM users LIMIT 1");
  if (rows.length > 0) return rows[0];

  console.error(
    "No user found in local D1.\n" +
      "Use --handle to create one:\n" +
      "  pnpm seed --handle taro_camera",
  );
  process.exit(1);
}

// ========== Main ==========

console.log(`Seeding ${COUNT} photos...`);

const { id: userId, handle } = resolveUser();
console.log(`User: @${handle} (${userId})`);

// セッション作成
const now = Math.floor(Date.now() / 1000);
const sessionId = randomUUID();
executeD1(
  `INSERT INTO upload_sessions (id, receiver_id, sender_name, photo_count, total_size, status, expires_at, created_at, updated_at) VALUES ('${sessionId}', '${userId}', 'seed-script', ${COUNT}, ${PLACEHOLDER_SIZE * COUNT}, 'completed', ${now + 3600}, ${now}, ${now})`,
);

// 写真データ生成 & ローカルR2にアップロード
const date = new Date();
const yearMonth = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
const senderNames = ["@hanako_photo", "@taro_cam", "camera_man_a", null, "@event_shooter"];
const cameraModels = ["Canon EOS R5", "Sony a7IV", "Nikon Z8", "FUJIFILM X-T5", null];

const photoValues = [];
for (let i = 0; i < COUNT; i++) {
  const photoId = randomUUID();
  const r2KeyOriginal = `${handle}/${yearMonth}/${photoId}.jpg`;
  const r2KeyThumb = `${handle}/${yearMonth}/${photoId}_thumb.jpg`;
  const senderName = senderNames[i % senderNames.length];
  const cameraModel = cameraModels[i % cameraModels.length];
  const createdAt = now - (COUNT - i) * 60;

  uploadR2("furdrop-originals", r2KeyOriginal, PLACEHOLDER_PATH);
  uploadR2("furdrop-thumbs", r2KeyThumb, PLACEHOLDER_PATH);
  process.stdout.write(`\rUploading to local R2... ${i + 1}/${COUNT}`);

  const sn = senderName ? `'${senderName}'` : "NULL";
  const cm = cameraModel ? `'${cameraModel}'` : "NULL";
  photoValues.push(
    `('${photoId}', '${userId}', '${sessionId}', '${r2KeyOriginal}', '${r2KeyThumb}', ${sn}, ${cm}, NULL, 'IMG_${String(i + 1).padStart(4, "0")}.JPG', ${PLACEHOLDER_SIZE}, ${PLACEHOLDER_SIZE}, 400, 300, 'completed', ${createdAt}, ${createdAt})`,
  );
}
console.log();

// D1にバッチINSERT
executeD1(
  `INSERT INTO photos (id, receiver_id, session_id, r2_key_original, r2_key_thumb, sender_name, camera_model, watermark_text, original_filename, file_size, thumb_size, width, height, upload_status, created_at, updated_at) VALUES ${photoValues.join(", ")}`,
);

// ストレージ使用量を更新
const totalSize = PLACEHOLDER_SIZE * COUNT * 2;
executeD1(
  `UPDATE users SET storage_used = storage_used + ${totalSize}, updated_at = ${now} WHERE id = '${userId}'`,
);

console.log(`Done! ${COUNT} photos seeded for @${handle}`);
