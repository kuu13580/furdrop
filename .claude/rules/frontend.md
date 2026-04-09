---
paths:
  - "frontend/**/*"
---

# フロントエンド ルール

## フレームワーク
- Reactの関数コンポーネントのみ使用する（クラスコンポーネント禁止）
- 状態管理にはJotaiのアトムを使う
- スタイリングはTailwind CSS（ユーティリティファースト、CSSモジュールは使わない）
- ルーティングはReact Routerを使用する

## 画像処理（クライアントサイド）
- 画像処理は全てブラウザで行う。サーバーには送らない
- サムネイル生成: Canvas API (OffscreenCanvas、非対応時はフォールバック)
- EXIF操作: piexifjs
- HEIC変換: heic2anyをdynamic importする（iOS向け、変換中はローディングUIを表示）
- PNG→JPEG変換: Canvas APIの toBlob
- ウォーターマーク: Canvas 2D APIで直接描画

## ファイルアップロード
- Workers APIから取得したPresigned PUT URLへ直接アップロードする
- 並列アップロードにはPromise.allSettledを使う
- ファイルごとの進捗表示、部分失敗に対応する
- アップロード中のページ離脱はbeforeunloadで防止する

## 認証
- クライアント側ではFirebase Auth SDKを使用する
- APIリクエスト時はgetIdToken()でAuthorizationヘッダーに設定する
- 未認証ルート: /send/:handle/*
- 認証必須ルート: /dashboard, /gallery/*, /settings

## 環境変数
- クライアント公開用は `VITE_` プレフィックスを付ける
- Firebase設定値は公開可（ドメイン制限で保護）
- `.env.local` に保存する (gitignore対象)
