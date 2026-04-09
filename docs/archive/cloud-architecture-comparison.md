# クラウドアーキテクチャ比較

ストレージコスト試算の結果、**egressコスト（ダウンロード転送料）が最大のコスト要因**であることが判明。
これを軸に、3つのアーキテクチャ案を比較する。

---

## 前提条件（再掲）

- 受信者: 最大100人
- 写真: 合計100,000枚 / 1TB
- 月間新規: ~1,000枚
- 月間DL量: 50〜500GB（変動）
- PWA優先、Web出身の開発者

---

## 案A: Cloudflare中心 + Firebase Auth

```
[ブラウザ/PWA]
    ↓ ↑
[Cloudflare Pages] ← 静的ホスティング（無料）
    ↓ ↑
[Cloudflare Workers] ← API / ビジネスロジック
    ↓ ↑
[Firebase Auth] ← 認証（Twitter OAuth等）
[Cloudflare R2]  ← 画像ストレージ（egress $0）
[Cloudflare D1]  ← メタデータDB（SQLite、エッジ）
```

### コスト試算

| コンポーネント | サービス | 無料枠 | 有料時の月額 |
|---|---|---|---|
| ホスティング | Cloudflare Pages | 無制限 | $0 |
| API | Cloudflare Workers | 100Kリクエスト/日 | $5/月（1000万リクエスト） |
| ストレージ | Cloudflare R2 | 10GB | **$15/月**（1TB） |
| DB | Cloudflare D1 | 5GB / 5M行読み取り/日 | $0.75/GB超過分 |
| 認証 | Firebase Auth | 50K MAU | $0（100人なら余裕） |
| egress | R2 | **無料** | **$0** |
| サムネイル | クライアント生成 | - | $0 |
| **合計** | | | **~$15/月** |

### メリット
- **egress $0** → DL量に関係なくコスト一定
- Cloudflare Pages/Workers/R2/D1 が統合されており開発体験が良い
- グローバルエッジで低レイテンシ
- Workers + R2の連携がネイティブ（署名付きURL等も簡単）

### デメリット
- Workers のCPU制限（無料: 10ms、有料: 30s）→ サーバーサイド画像処理には不向き
- D1 はまだ比較的新しい（ただしSQLite互換で安定）
- Firebase Authが外部サービスになる（Cloudflareネイティブの認証はない）
- R2にIntelligent-Tiering相当の自動階層化がない

### Firebase Auth連携の実現方法
- クライアント側でFirebase SDKを使ってログイン → IDトークン取得
- Workers APIにIDトークンを送信 → Firebase Admin SDKでトークン検証
- Workers用のFirebase Admin SDK（REST API経由）は軽量に実装可能

---

## 案B: AWS サーバーレス

```
[ブラウザ/PWA]
    ↓ ↑
[CloudFront + S3] ← 静的ホスティング
    ↓ ↑
[API Gateway + Lambda] ← API
    ↓ ↑
[Cognito]                 ← 認証
[S3 Intelligent-Tiering]  ← 画像ストレージ
[DynamoDB]                 ← メタデータDB
```

### コスト試算

| コンポーネント | サービス | 無料枠（12ヶ月） | 有料時の月額 |
|---|---|---|---|
| ホスティング | CloudFront + S3 | 1TB転送/月 | ~$1 |
| API | API Gateway + Lambda | 100万リクエスト | ~$1 |
| ストレージ | S3 Intelligent-Tiering | 5GB | **$4〜23/月**（1TB） |
| DB | DynamoDB | 25GB, 25 RCU/WCU | $0（このスケールなら無料枠内） |
| 認証 | Cognito | 50K MAU | $0 |
| **egress** | CloudFront | 1TB（無料枠） | **$0.085/GB = $42.50**（500GB DL時） |
| サムネイル | Lambda | 100万リクエスト | ~$0.01 |
| **合計** | | | **$48〜67/月** |

### メリット
- Intelligent-Tieringでストレージ自体は最安
- Lambdaでサーバーサイド画像処理が可能
- AWSエコシステムが成熟、ドキュメント豊富
- Cognitoで認証が完結（Twitter OAuth対応）

### デメリット
- **egress料金が支配的**（DL 500GBで$42.50）
- 無料枠は12ヶ月で終了（DynamoDB以外）
- API Gateway + Lambda の設定がやや複雑
- Cognitoの開発体験はFirebaseに劣ると言われがち

---

## 案C: Supabase + Cloudflare R2

```
[ブラウザ/PWA]
    ↓ ↑
[Cloudflare Pages] ← 静的ホスティング（無料）
    ↓ ↑
[Supabase Edge Functions] ← API（Deno / TypeScript）
    ↓ ↑
[Supabase Auth]    ← 認証（Twitter OAuth対応）
[Cloudflare R2]    ← 画像ストレージ（egress $0）
[Supabase DB]      ← PostgreSQL
```

### コスト試算

| コンポーネント | サービス | 無料枠 | 有料時の月額 |
|---|---|---|---|
| ホスティング | Cloudflare Pages | 無制限 | $0 |
| API + DB + Auth | Supabase Free | 500MB DB / 1GB Storage / 50K MAU | $0 |
| API + DB + Auth | Supabase Pro（超過時） | 8GB DB / 100GB Storage | $25/月 |
| ストレージ | Cloudflare R2 | 10GB | **$15/月**（1TB） |
| egress | R2 | **無料** | **$0** |
| サムネイル | クライアント生成 | - | $0 |
| **合計（Free枠内）** | | | **~$15/月** |
| **合計（Pro必要時）** | | | **~$40/月** |

### メリット
- **Supabase Authが認証・DB・APIを一体提供** → 開発速度が速い
- PostgreSQLベース → RLSでセキュリティが堅い
- Twitter OAuth等のソーシャルログインを標準サポート
- R2のegress $0と組み合わせてコスト最適
- ダッシュボードが使いやすい

### デメリット
- Supabase Free の制限（500MB DB、同時接続50）→ メタデータだけなら十分
- Edge Functions はCloudflare Workersほど成熟していない
- ストレージがR2（外部）になるため、Supabase Storageとの統合がない → 自前でR2連携を実装
- Supabase自体がベンダーロックイン（ただしPostgreSQLなので移行は比較的容易）

---

## 総合比較

| 観点 | 案A: Cloudflare + Firebase | 案B: AWS | 案C: Supabase + R2 |
|---|---|---|---|
| **月額コスト（1TB, DL500GB）** | **~$15** | ~$48-67 | **~$15-40** |
| **egress** | **$0** | $42.50 | **$0** |
| **認証の開発体験** | 良い（Firebase経験あり） | 普通（Cognito） | **良い（統合済み）** |
| **DB** | D1（SQLite、軽量） | DynamoDB（NoSQL） | **PostgreSQL（リッチ）** |
| **サーバーサイド画像処理** | 制約あり（CPU制限） | **Lambda可能** | 制約あり |
| **開発の統合度** | 高い（Cloudflare内） | 中（複数サービス連携） | 中（2ベンダー） |
| **スケーラビリティ** | 高い | **最高** | 中 |
| **学習コスト** | 低〜中 | 中〜高 | **低** |
| **将来の有料プラン対応** | Workers有料化で対応 | 柔軟 | Supabase Pro |

---

## 推奨

### 第1推奨: 案A（Cloudflare中心 + Firebase Auth）

**理由:**
1. **コスト最安**（$15/月で固定、DL量に依存しない）
2. **Cloudflare内で完結**するためインフラ管理が最小（Pages + Workers + R2 + D1）
3. **Firebase Auth経験あり**で認証部分の学習コストが低い
4. PWAとの相性が良い（エッジでの配信）
5. 将来ユーザーが増えてもegress $0なのでコストが予測可能

**懸念点と対策:**
- サーバーサイド画像処理 → クライアントサイドでサムネイル生成（Canvas API）で回避
- D1の成熟度 → メタデータだけなので要件は軽い。問題が出たらTurso等に移行可能

### 第2推奨: 案C（Supabase + R2）

案AでDB周りの要件が複雑化した場合（例: 複雑なクエリ、RLS）の代替案。
PostgreSQLの柔軟性が活きるが、2ベンダー管理になる点がトレードオフ。
