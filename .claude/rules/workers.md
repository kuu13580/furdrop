---
paths:
  - "workers/**/*"
---

# Workers ルール

## フレームワーク
- ルーティングとミドルウェアにはHonoを使用する
- リクエスト/レスポンス処理にはHonoのコンテキスト (`c`) を使う

## D1クエリ
- 必ずprepared statementと `.bind()` を使用する。SQL文字列の結合は禁止
- タイムスタンプは `INTEGER` (UNIX秒) で保存する。datetime文字列は使わない
- UUIDやenumは `TEXT` 型を使用する

## R2
- R2へのアクセスは全てPresigned URL経由。Workersを通してストリームしない（CPU制限のため）
- Presigned PUTにはContent-Lengthを署名に含める

## 認証
- Firebase IDトークンの検証はWeb Crypto API (SubtleCrypto) で行う
- Googleの公開鍵はCloudflare Cache APIでキャッシュする
- 受信者エンドポイントでは必ず `receiver_id == 認証済みUID` を検証する

## エラーレスポンス
- `{ error: { code: string, message: string } }` 形式で返す
- 標準HTTPステータスコードを使用する (400, 401, 403, 404, 409, 413, 429, 507)

## 環境変数
- Bindingsの型定義は `src/types.ts` に記述する
- 非秘密の変数は `wrangler.toml [vars]` に記述
- 秘密情報は `workers/.env` にdotenvxで暗号化管理。`pnpm generate:wrangler` で `.dev.vars` と `wrangler.toml` を自動生成
- 本番環境には `wrangler secret put` でも設定が必要
