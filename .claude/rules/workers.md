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
- 画像のデコード・リサイズ・再エンコードは Workers で行わない（CPU制限のため）。クライアントでやる
- 表示・単体DL・アップロードは Presigned URL 経由でクライアントが R2 と直接やり取りする
- **例外: 一括DL (R08) だけは Workers を通してバイトを流す。** ZIP は複数オブジェクトを
  1本のレスポンスにまとめる必要があり、クライアントで組み立てるとメモリに全量が溜まるため。
  CPU は CRC32 のみで約 27 CPU-ms/MiB。`[limits] cpu_ms` と `MAX_ZIP_BYTES` で上限を縛る
- Presigned PUTにはContent-Lengthを署名に含める

## ストリーミングレスポンス
- `ZipWriter.add` は必ず直列化する（並列に呼ぶと zip.js が内部バッファ経路に入り、
  ランタイム次第でメモリが溜まるか無言でエントリが欠落する）。`createZipStream` が内部で担保済み
- ヘッダを送出した後はエラーに切り替えられない。**途中で切れたレスポンスはブラウザが
  「DL完了」として保存してしまう**ので、失敗しうる検証はすべてヘッダ送出前に済ませる。
  個別の失敗はスキップして `MISSING.txt` に落とし、ZIP は必ず正常に閉じる

## 認証
- Firebase IDトークンの検証は `firebase-auth-cloudflare-workers` ライブラリで行う
- Google公開鍵のキャッシュには Workers KV (`PUBLIC_JWK_CACHE_KV`) を使用する
- 受信者エンドポイントでは必ず `receiver_id == 認証済みUID` を検証する

## エラーレスポンス
- `{ error: { code: string, message: string } }` 形式で返す
- 標準HTTPステータスコードを使用する (400, 401, 403, 404, 409, 413, 429, 507)

## 環境変数
- Bindingsの型定義は `src/types.ts` に記述する
- 非秘密の変数は `wrangler.toml [vars]` に記述
- 秘密情報はルートの `.env` (開発用) / `.env.prod` (本番用) にdotenvxで暗号化管理
- `pnpm generate` (開発) / `pnpm generate:prod` (CIの本番デプロイ) で `.dev.vars` と `wrangler.toml` を自動生成
- 新しい変数を追加する際は `.env` と `.env.prod` 両方に `dotenvx set` する
