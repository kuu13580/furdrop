---
paths:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "e2e/**/*"
  - "workers/test/**/*"
  - "frontend/test/**/*"
---

# テスト ルール

## 基本原則
- ユニットテストの対象は `frontend/src/lib/` の純粋関数のみ
- それ以外 (UI コンポーネント、ページ、フック、Workers ルートハンドラ、Cron) は E2E (Playwright) または Workers 統合 (vitest-pool-workers) でカバー
- **テスト単位は「コンポーネント / ページ / エンドポイント」**。内部関数の条件分岐網羅は禁止 (実装詳細にロックインされ、リファクタで剥がされるテストになる)
- **粒度は「機能あたり最低限のケース」**。1 機能 1 ケース固定ではなく、その機能 / フローの外から見える挙動 (正常系・主要失敗系・権限境界など) を代表点でカバー
- ケースには **目的** を `it("…が…する (目的: …)")` か直前のコメントで明示
- モック・スパイは最小限。Cloudflare バインディング (D1/R2/KV/ratelimit) と Firebase Auth は miniflare / Emulator で本物挙動を再現する
- テストのために製品コードを改造しない (例外: env を介した emulator 切替の 1 行、本番動作に影響なし)

## レイヤー別追加先マップ

| 変更 | 追加先 | ツール |
|---|---|---|
| `frontend/src/lib/*.ts` 新規純粋関数 | `frontend/test/lib/<name>.test.ts` | Vitest (node) |
| `workers/src/routes/*.ts` 新規ハンドラ | `workers/test/<area>-<verb>.test.ts` | vitest-pool-workers |
| `workers/src/cron/*.ts` 新規ジョブ | `workers/test/cron-<name>.test.ts` | vitest-pool-workers |
| `frontend/src/pages/*.tsx` 新規ページ | `e2e/tests/<flow>.spec.ts` | Playwright |
| `frontend/src/components/` 新規コンポーネント | 単体テスト不要、ページ経由で E2E | Playwright |

## Firebase Auth Emulator 前提
- project_id は `demo-furdrop` 固定。本物 Firebase に絶対に触らない
- port 9099。`pnpm emulator` で起動
- emulator が落ちている状態で test:workers / test:e2e は失敗する (バイパス禁止)
- Workers では `verifyIdToken(token, false, env)` の第 3 引数で `FIREBASE_AUTH_EMULATOR_HOST` を渡し、ライブラリに自動切替させる
- Frontend では `VITE_FIREBASE_AUTH_EMULATOR_HOST` が定義されていれば `connectAuthEmulator` を呼ぶ (本番では未定義なので no-op)

## Workers 統合テスト
- `@cloudflare/vitest-pool-workers` の per-test-file storage isolation を利用 (`beforeEach` でのロールバック不要、ファイル境界が境界)
- `setupFiles` で `applyD1Migrations` を呼び、毎回 `migrations/` をすべて当てる
- D1 / R2 / KV は miniflare のローカル実装を使い、本物挙動を再現する (専用スパイ禁止)
- `wrangler.test.toml` に `[[unsafe.bindings]]` で ratelimit binding を宣言。テスト用に `limit` を実質無制限 (10000) に設定
- 認証ヘッダが必要なケースは `test/helpers/auth.ts` の `createEmulatorUser()` で Auth Emulator から idToken を取得

## E2E (Playwright)
- chromium のみ
- HEIC は `heic-to` (WASM) で Chromium ヘッドレスでも動く → `e2e/fixtures/sample.heic` を投入する spec を 1 本入れる。動かなければ `frontend/test/lib/heic.test.ts` (Node + heic-to 直接呼び出し) にフォールバック
- fixtures は JPEG (`e2e/fixtures/*.jpg`) + HEIC (`sample.heic`)
- Twitter OAuth は Auth Emulator 非対応のため、E2E では `signInWithEmailAndPassword` で代替 (本番フローは目視確認)
- `playwright.config.ts` の `webServer` で workers (9000) + frontend (4000) を起動

## テストデータ
- D1: 各テスト先頭で `workers/test/helpers/seed.ts` 経由で投入
- R2: `app.fetch("/dev/images/upload/...", { method: "PUT" })` で投入 (本番と同じ経路)
- Firebase: 各テスト先頭で UUID 付きメールで signUp (衝突回避)

## ローカル実行

```bash
# Auth Emulator (JRE 17+ 必須) を経由
pnpm test              # 3 層すべて (firebase emulators:exec で包む)
pnpm test:frontend     # frontend ユニットのみ (emulator 不要)
pnpm test:workers      # Workers 統合のみ (emulator 必要)
pnpm test:e2e          # Playwright のみ (emulator + dev servers)
pnpm emulator          # Auth Emulator を手動起動 (port 9099)
```

## CI
- `.github/workflows/ci.yml` で `test-frontend` / `test-workers` / `test-e2e` を並列実行
- `test-workers` / `test-e2e` は `actions/setup-java@v4` で JRE 17 をセットアップしてから `firebase emulators:exec` を起動
- E2E 失敗時の Playwright HTML レポートは Actions artifact から取得

## 既知ギャップ (許容)
- Twitter OAuth: Auth Emulator 非対応のため、本番フローはこのテスト基盤では検証しない (目視確認に依存)
- Rate Limiter の境界条件: Cloudflare 提供機能なので製品ロジック外、テスト対象外
- R2 Presigned URL の AWS SDK 署名検証: dev モード (`/dev/images/upload/...` プロキシ) で代替
- 暗号化 .env: テストは `pnpm generate` に依存しない設計のため、`DOTENV_PRIVATE_KEY` は不要

## 新しいテストの追加手順
1. 上記「レイヤー別追加先マップ」で配置先を決定
2. 既存ファイルの命名規則に合わせる (`<area>-<verb>.test.ts` など)
3. 各 `it` / `test` に目的を明示
4. `pnpm test:<layer>` で動作確認
5. PR を出す前に 3 層全部実行 (`pnpm test`)
