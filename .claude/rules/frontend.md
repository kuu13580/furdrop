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

## ビューポート単位
- 画面高さ基準のサイズ指定 (`min-h-*` / `max-h-*` / `calc(... vh ...)` 等) には `vh` ではなく `dvh` を使う
- 理由: iOS Safari の `vh` は最大ビューポート (URL バー非表示時) 基準で固定されるため、URL バー表示時に画像やダイアログがはみ出る・スクロール時に下部に余白が出るなどの不具合が発生する。`dvh` は動的ビューポートに追従する
- JSの `window.innerHeight` は iOS でも動的なのでそのままで可

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
