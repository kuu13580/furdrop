# FurDrop

写真を匿名で受け取るためのWebサービス。

## 技術スタック

- **フロントエンド**: React + TypeScript + Vite + Tailwind CSS + Jotai (PWA)
- **API**: Cloudflare Workers + Hono
- **DB**: Cloudflare D1 (SQLite)
- **ストレージ**: Cloudflare R2
- **認証**: Firebase Auth (Twitter OAuth)
- **多言語化**: Lingui (日本語=原文 / 英語)
- **リント/フォーマット**: Biome
- **パッケージマネージャ**: pnpm (workspaces)
- **E2Eテスト**: Playwright
- **CI**: GitHub Actions

## モノレポ構成

```
frontend/   # Cloudflare Pages (PWA)
workers/    # Cloudflare Workers (API)
e2e/        # Playwright テスト
docs/       # 設計ドキュメント
```

## コマンド

```bash
# 依存インストール
pnpm install

# リント + フォーマットチェック
pnpm check

# リント + フォーマット自動修正
pnpm fix

# 型チェック
pnpm typecheck

# フロントエンド開発サーバー
pnpm --filter frontend dev

# Workers開発サーバー
pnpm --filter workers dev

# D1マイグレーション (ローカル)
# dev が起動時に自動実行するので、通常は手動実行不要
pnpm --filter workers migrate:local

# D1マイグレーション (本番)
pnpm --filter workers migrate:prod

# 設定ファイル生成 (テンプレート + dotenvx、開発用 .env を使用)
# workers: wrangler.toml + .dev.vars, frontend: .env.local を自動生成
pnpm generate

# 設定ファイル生成 (本番用 .env.prod を使用。CIでのみ使用)
pnpm generate:prod

# 本番Workersシークレット投入 (.env.prod から R2クレデンシャル等を一括アップロード)
# CIのdeployワークフローで自動実行されるため通常手動実行は不要
pnpm secrets:prod

# R2バケットCORS設定適用 (workers/r2-cors.json の内容を両バケットに適用)
# CIのdeployワークフローで自動実行される
pnpm cors:prod

# i18n カタログ更新 (ユーザー向け文言を追加・変更したら実行)
pnpm i18n:extract

# i18n ガード (カタログ乖離 + 日本語直書きのラチェット)。CI でも実行される
pnpm i18n:check

# 翻訳が進んでベースラインが減ったら更新する
pnpm i18n:lint:update

# ===== テスト =====
# 3 層すべて (frontend ユニット + Workers 統合 + Playwright E2E) を一括実行
# 内部で firebase emulators:exec で Auth Emulator を立ち上げる (JRE 17+ 必須)
pnpm test

# frontend ユニットテストのみ (Vitest、emulator 不要)
pnpm test:frontend

# Workers 統合テストのみ (vitest-pool-workers + Auth Emulator)
pnpm test:workers

# Playwright E2E のみ (Auth Emulator + Vite + Wrangler dev)
pnpm test:e2e

# Auth Emulator を手動起動 (port 9099、別ターミナルで `pnpm test:workers` 等を回す用)
pnpm emulator

# `:bare` 派生は emulator 起動を含まない (外側が `pnpm emulator` を立てている前提)。
# `pnpm test` の内部で使われる。手動で叩く必要は基本ない。
```

詳細なテスト規約は `.claude/rules/testing.md` を参照。

### 環境ファイル

- `.env`: 開発用 (暗号化、コミット対象)。復号キーは `.env.keys` の `DOTENV_PRIVATE_KEY` (gitignore)
- `.env.prod`: 本番用 (暗号化、コミット対象)。復号キーは `.env.keys` の `DOTENV_PRIVATE_KEY_PROD` (gitignore)
  - CIでは GitHub Secret `DOTENV_PRIVATE_KEY_PROD` から注入
- 値を編集する場合: `pnpm exec dotenvx set KEY value -f .env.prod` (本番) / `pnpm exec dotenvx set KEY value` (開発=`.env`)

## Gitワークフロー

- `main`: 本番リリースブランチ
- `feature/*`: 新機能
- `bugfix/*`: 不具合修正
- mainへのマージは必ずPRを作成する
- スカッシュマージで履歴をきれいに保つ
- **既存ブランチに追加 push する前に、対応する PR がすでに merge されていないかを `gh pr view <番号> --json state,mergedAt` 等で必ず確認する**。merge 済みの PR のブランチに追加 push しても新しいコミットは PR に含まれず main にも入らない。新しい変更は main から切った別ブランチで別 PR にする
- **PR description の Test plan は「レビュアーに実際に確認してほしい動作」を 3〜5 件のチェックボックスに絞る**。網羅的に書くと多すぎて全部チェックされず形骸化する。型チェック・lint・自動テストなど CI で検証されるものは含めない。人間でしか確認できない目視・実機・操作フローに限定する

## コードスタイル

- Biomeがリント + フォーマットを担当。コミット前に `pnpm check` を実行する
- TypeScript strictモード有効
- ES modules (import/export) を使用する
- `let` よりも `const` を優先する
- エラーはステータスコード付きの構造化エラーをthrowする

## API設計規約

- **PATCH**: リソースの一部更新。送信されたフィールドのみ更新する。省略されたフィールドは変更しない
- **PUT**: リソースの全体置換。全フィールドを受け取り、全て上書きする

## タスク完了時の確認事項

実装タスクの完了後、以下に更新が必要か確認すること:

- `CLAUDE.md` — コマンド、構成、スタイルの変更
- `docs/` — 設計ドキュメントとの乖離がないか
- `.claude/rules/` — コーディングルール・規約の変更
- `DESIGN.md` — デザイン規約 (色・タイポ・コンポーネント・レイアウト理念) の変更
- ユーザー向け文言の追加・変更時は `pnpm i18n:extract` でカタログを更新する。日本語の直書きは `pnpm i18n:check` で落ちる
- `frontend/src/pages/DesignPreviewPage.tsx` — **`DESIGN.md` を更新した場合は必ずプレビューも追従更新**。プレビューは DESIGN.md の生きたカナリアであり、乖離すると視覚回帰チェックの意味が失われる

## 設計ドキュメント

- 要件定義: @docs/requirements.md
- アーキテクチャ: @docs/architecture.md
- 画面フロー: @docs/screen-flow.md
