// vitest の setupFiles から自動実行され、各テストファイル開始時に
// miniflare の D1 (per-file storage isolation で fresh な状態) に
// migrations/ 配下の SQL を全件適用する。
import { applyD1Migrations, env } from "cloudflare:test";

// 本番 Cloudflare D1 は FOREIGN KEY 制約を強制しない (内部実装の都合) が、
// miniflare の D1 (SQLite ベース) はデフォルトで強制する。
// この挙動差で本番では通る DELETE が miniflare では失敗するため、テストでも
// 本番に揃えて FOREIGN KEY を OFF にする (R15 アカウント削除フロー等の検証のため)。
await env.DB.exec("PRAGMA foreign_keys = OFF");
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
