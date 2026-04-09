# image-share

写真を匿名で受け取るためのWebサービス。

## 技術スタック

- **フロントエンド**: React + TypeScript + Vite + Tailwind CSS + Jotai (PWA)
- **API**: Cloudflare Workers + Hono
- **DB**: Cloudflare D1 (SQLite)
- **ストレージ**: Cloudflare R2
- **認証**: Firebase Auth (Twitter OAuth)
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
pnpm --filter workers migrate:local

# D1マイグレーション (本番)
pnpm --filter workers migrate:prod
```

## Gitワークフロー

- `main`: 本番リリースブランチ
- `feature/*`: 新機能
- `bugfix/*`: 不具合修正
- mainへのマージは必ずPRを作成する
- スカッシュマージで履歴をきれいに保つ

## コードスタイル

- Biomeがリント + フォーマットを担当。コミット前に `pnpm check` を実行する
- TypeScript strictモード有効
- ES modules (import/export) を使用する
- `let` よりも `const` を優先する
- エラーはステータスコード付きの構造化エラーをthrowする

## 設計ドキュメント

- 要件定義: @docs/requirements.md
- アーキテクチャ: @docs/architecture.md
- 画面フロー: @docs/screen-flow.md
