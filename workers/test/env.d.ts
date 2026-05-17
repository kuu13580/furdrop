// cloudflare:test の `env` は wrangler.test.toml のバインディングを反映する。
// 加えて vitest.config.ts の miniflare.bindings で渡している TEST_MIGRATIONS を宣言。
import type { Env as AppEnv } from "../src/types";

declare module "cloudflare:test" {
  // applyD1Migrations が受け取る形 (readD1Migrations の戻り値)
  interface ProvidedEnv extends AppEnv {
    TEST_MIGRATIONS: D1Migration[];
  }
}
