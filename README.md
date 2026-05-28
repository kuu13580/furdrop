# FurDrop

写真を匿名で受け取るための Web サービス。

受信者が公開 URL を発行し、送信者はその URL を開くだけでアカウント登録なしに写真を送れる。イベントやライブ参加者からの写真集約、SNS / 名刺経由での継続受付などを想定。

## 特徴

- **匿名送信** — 送信者にアカウント登録不要。URL とアクセスキーだけで送信可能
- **送信者情報の自動埋め込み** — EXIF カメラモデル欄 / 透かし (Canvas 描画) に送信者名を埋め込める。受信者側で `disabled / optional / required` を制御
- **画像専用** — JPEG / PNG / HEIC のみ受付。サーバ側でマジックバイト検証
- **DL 期限による自動削除** — 受信から 30 日でストレージから自動削除 (無料ストレージ悪用防止)
- **コスト最適化** — Cloudflare R2 の egress 無料を活かし、月額 \~\$15 / 100 受信者 / 1TB を目標

## アーキテクチャ

| レイヤー | 技術 |
|---|---|
| フロントエンド | React + TypeScript + Vite + Tailwind CSS + Jotai (Cloudflare Pages) |
| API | Cloudflare Workers + Hono |
| DB | Cloudflare D1 (SQLite) |
| ストレージ | Cloudflare R2 (Presigned URL 経由でクライアント直接 PUT/GET) |
| 認証 | Firebase Auth (Twitter OAuth) — Workers では Web Crypto API で JWT 検証 |
| E2E | Playwright |
| CI/CD | GitHub Actions |

画像処理 (サムネ生成 / フォーマット変換 / EXIF 書換 / 透かし) はすべてクライアントサイドで完結する。サーバは Presigned URL 発行とメタデータ管理に専念し、コストとレイテンシを最小化。

## モノレポ構成

```
frontend/   # Cloudflare Pages (React アプリ)
workers/    # Cloudflare Workers (API)
e2e/        # Playwright テスト
docs/       # 設計ドキュメント
```

pnpm workspaces + Biome (lint/format) + dotenvx (秘密情報の暗号化コミット)。

## ローカル開発

```bash
pnpm install
pnpm generate                  # テンプレートから wrangler.toml / .env.local を生成
pnpm --filter frontend dev     # フロントエンド開発サーバ
pnpm --filter workers dev      # Workers 開発サーバ
pnpm typecheck                 # 型チェック
pnpm check                     # Biome lint/format チェック
pnpm test                      # ユニット + Workers 統合 + E2E
```

詳細なコマンド・環境ファイルの扱いは [CLAUDE.md](./CLAUDE.md) を参照。

## ドキュメント

- 要件定義: [docs/requirements.md](./docs/requirements.md)
- アーキテクチャ: [docs/architecture.md](./docs/architecture.md)
- 画面フロー / UX 設計: [docs/screen-flow.md](./docs/screen-flow.md)
- デザイン規約: [DESIGN.md](./DESIGN.md)
