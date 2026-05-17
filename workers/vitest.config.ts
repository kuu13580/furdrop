import path from "node:path";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  // migrations ディレクトリの SQL を全件読み込んで、テスト用の miniflare D1 に当てる。
  // 各テストファイルの setupFiles で applyD1Migrations(env.DB, env.TEST_MIGRATIONS) を呼ぶ。
  const migrationsPath = path.join(__dirname, "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  return {
    test: {
      setupFiles: ["./test/setup/migrate.ts"],
      poolOptions: {
        workers: {
          // singleWorker: true でテスト全体を 1 つの Worker isolate で走らせる。
          // ratelimit binding の状態リセット責任をテスト側に閉じ込め、
          // テスト間の競合を抑える (limit は十分大きく取っているため衝突自体は起きない)。
          singleWorker: true,
          wrangler: { configPath: "./wrangler.test.toml" },
          miniflare: {
            // setupFiles 内で env.TEST_MIGRATIONS として参照する。
            // applyD1Migrations はこれをそのまま受け取れる形 (PreparedMigration[])。
            bindings: { TEST_MIGRATIONS: migrations },
          },
        },
      },
    },
  };
});
