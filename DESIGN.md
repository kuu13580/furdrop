# FurDrop デザインシステム

> Inspired by [Airbnb](https://getdesign.md/airbnb) と [Pinterest](https://getdesign.md/pinterest) のDESIGN.md。
> Airbnbの「旅行マガジンのような暖かさ」と「三層シャドウの自然なリフト」、Pinterestの「オリーブ/サンドの暖色ニュートラル」を融合し、FurDrop固有のサンセットコーラル・パレットで統合したもの。
> **レイアウトは masonry ではなく均一グリッドを採用** — 受信者が DL 対象を選ぶ際のスキャンしやすさ・チェックボックスの配置しやすさを優先する。

> ⚠️ **メンテナンス**: このファイルを更新する際は、生きたカナリアである `frontend/src/pages/DesignPreviewPage.tsx` (`/design-preview`) も必ず同期更新すること。乖離するとプレビューの視覚回帰チェックが機能しなくなる。

## 1. Visual Theme & Atmosphere

FurDropは「不特定多数から匿名で写真を受け取る」ためのサービス。デザインは、フィルム写真のアルバムを開くような暖かいクリーム色のキャンバス (`#FAF6F0`) と、夕暮れの空を思わせるサンセットコーラル (`#D96A4A`) を基調とする。受信者にとっては自分のギャラリーを眺める時間、送信者にとっては「届けた」ことを伝える瞬間 — どちらも温度のあるUIであるべきで、冷たいSaaSのような青味や純白は採用しない。

主役は常に写真である。受信者のS07ギャラリーは**均一グリッド**で構成し、送信者のS01ランディングとS04完了画面は Airbnb 流のカード主導で構成する。UIシェル自体は暖色ニュートラルで抑えめにし、写真が画面の色彩を支配する。

**写真は必ず「全体」を見せる (コア理念)**: 受信者が「どれをダウンロードするか」を判断する基本動作は、サムネイルの時点で写真の全体像を見て選ぶこと。したがってサムネイルであっても写真をクロップしてはならない。縦長・横長・正方形いずれの写真も、長辺をカード枠に合わせて**全体が映る (`object-fit: contain` 相当)** 表示を徹底する。角丸 (rounded) は適用してよい。

**グリッドは均一 (masonry 非採用)**: Pinterest 流のマsonryは写真の縦横比をそのままカード形状に反映するためバラバラな形になり、DL選択時にチェックボックスの位置が揺れ・視線の軌道が乱れ・複数選択時のスキャン効率が落ちる。FurDropではギャラリー用途として**固定比率 (正方形) の均一グリッド**を採用し、写真は枠内に `contain` で全体を収め、余白は Cream 台座で吸収する。こうすることで格子状に視線が走り、選択操作が素早く正確になる。

タイポグラフィは `Inter` + `Noto Sans JP` の2段ファミリーで、日本語UIでも読みやすく、かつTwitterハンドル等の英数字が美しく見える組み合わせを選ぶ。ウェイトは 400/500/600/700 の4段のみに絞り、見出しには -0.01em 〜 -0.02em のネガティブトラッキングを入れて「親密な見出し」を作る。

深度は Airbnb の三層シャドウを採用 (`0 0 0 1px rgba(0,0,0,0.02)`, `0 2px 6px rgba(0,0,0,0.04)`, `0 4px 8px rgba(0,0,0,0.10)`)。一方でギャラリーのサムネイルは「影を使わず、Cream 台座と写真自体でリズムを作る」フラット表現とする。

**Key Characteristics:**
- 暖かいクリームキャンバス `#FAF6F0` + サンセットコーラル `#D96A4A` (単一ブランドアクセント)
- オリーブ/サンド系ニュートラル — 冷たいスチールグレーは禁止
- 三層シャドウによるカードの自然なリフト (Airbnb由来)
- フラットな均一グリッドギャラリー — 格子状の整列でDL選択のUXを最優先
- 寛大な border-radius: ボタン 8/16px、カード 20px、大コンテナ 32px、ナビ 50%
- Inter + Noto Sans JP、ウェイト 400–700、見出しに負トラッキング
- 本文色はエスプレッソブラウン `#2A1F1B` — 純黒 (`#000000`) は使わない
- 写真ファースト: 受信写真・受信者アバター・送信者アイコンがUIの主役
- **写真の全体を常に表示**: クロップ禁止、長辺合わせ (`contain`)、角丸は許容。DL対象を正しく選べるUXを最優先

## 2. Color Palette & Roles

カラーは「ブランド」「ニュートラル」「セマンティック」の3グループで管理する。ブランド色を広範囲に使わず、CTAとロゴ、アクティブ状態に限定することで、写真自体の色彩を邪魔しない。

### Primary Brand
| Token | Hex | 用途 |
|---|---|---|
| **Sunset Coral** | `#D96A4A` | プライマリCTA、ブランドアクセント、アクティブ状態、ロゴ |
| **Deep Terracotta** | `#B8502F` | Coralのホバー/プレス、ダーク変種 |
| **Coral Tint** | `#FCEDE4` | 選択状態の背景、トースト成功の弱い塗り |

### Text Scale (暖色系)
| Token | Hex | 用途 |
|---|---|---|
| **Espresso** | `#2A1F1B` | 本文・見出し (純黒ではなく暖かみのある茶黒) |
| **Mocha** | `#6E5F52` | セカンダリ本文、説明文、メタデータ |
| **Warm Silver** | `#A79A8C` | 無効状態、プレースホルダ、弱い補助テキスト |
| **White** | `#FFFFFF` | Coral背景上のテキスト、ダークサーフェス上 |

### Surface & Border (オリーブ/サンド系)
| Token | Hex | 用途 |
|---|---|---|
| **Cream Canvas** | `#FAF6F0` | ページ背景 — 純白を避けた暖色オフホワイト |
| **Pure Surface** | `#FFFFFF` | カード・モーダル・入力欄の表面 |
| **Sand** | `#F1E8DB` | セカンダリボタン背景、サムネイル周囲の台座 |
| **Sand Deep** | `#EAE1D3` | ボーダー、区切り線、ホバーサーフェス |
| **Sand Hover** | `#DED3C1` | セカンダリボタンのホバー |

### Semantic
| Token | Hex | 用途 |
|---|---|---|
| **Sage** | `#4B7A5A` | 成功 (アップロード完了、保存完了) |
| **Sage Tint** | `#E8F0EA` | 成功トーストの背景 |
| **Rust** | `#A8381F` | エラー本文 (`text-red-600` 相当の置換) |
| **Rust Tint** | `#FBE8E2` | エラーバナー背景 |
| **Amber** | `#D98F2E` | 警告 (ストレージ 80% 超過、期限切れ間近) |
| **Cobalt** | `#4262D4` | リンク、フォーカスリング (アクセシビリティ用途のみ) |

### Quota Bar 色分け
ストレージ使用率に応じて動的に変える (S06 ダッシュボード、S10 設定):
- **0–79%**: Sage `#4B7A5A`
- **80–94%**: Amber `#D98F2E`
- **95–100%**: Rust `#A8381F`

## 3. Typography Rules

### Font Family
- **Primary (ラテン)**: `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
- **Primary (日本語)**: `"Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "ヒラギノ角ゴ ProN W3", "Yu Gothic", "Meiryo", sans-serif`
- **Monospace (ハンドル・URL・コード)**: `"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace`

Twitterハンドル (`@taro_camera`) やスラッグ (`/send/taro_camera`) はラテン英数字のため Inter のみで良く、等幅は「URLを見せる場面」でのみ使用する。

### Hierarchy

| Role | Mobile (<sm) | Desktop (sm+) | Weight | Line Height | Letter Spacing | 用途 |
|---|---|---|---|---|---|---|
| Display Hero | 28px | 40px / 2.5rem | 700 | 1.15 | -0.02em | 送信完了ヒーロー (S04) |
| Page Title | 22px | 28px / 1.75rem | 700 | 1.25 | -0.015em | ダッシュボード・ギャラリー見出し |
| Section Heading | 22px | 22px / 1.375rem | 600 | 1.30 | -0.01em | 「最近の写真」「ストレージ」等 |
| Card Title | 18px | 18px / 1.125rem | 600 | 1.35 | -0.005em | 受信者名、ファイル名 |
| Body Emphasis | 16px | 16px / 1rem | 500 | 1.50 | normal | 強調本文、ナビゲーション |
| Body | 16px | 16px / 1rem | 400 | 1.50 | normal | 標準本文 |
| UI Label | 14px | 14px / 0.875rem | 500 | 1.40 | normal | ボタン、フォームラベル |
| Meta | 14px | 14px / 0.875rem | 400 | 1.45 | normal | 送信者名、日付、ファイルサイズ |
| Caption | 12px | 12px / 0.75rem | 400 | 1.40 | 0.01em | タグ、補助テキスト |
| Micro Upper | 11px | 11px / 0.688rem | 700 | 1.30 | 0.08em | 「NEW」「BETA」等の uppercase バッジ |

### Mobile Type Scale (縮小対象)

**縮小する (Hero / Title 級のみ)**: モバイルは視野が狭く、ヒーロー・ページタイトルの 40/28px は視覚的に支配的すぎる。コンテンツの呼吸量を確保するため、**タイトル級のみを 1 段階下げる**。
- Display Hero: `text-[28px] sm:text-[40px]`
- Page Title: `text-[22px] sm:text-[28px]`

**縮小しない (インタラクティブ・情報密度要素)**: 以下は**モバイルでも現状サイズを維持する**。操作の確実性・情報の読み取りに直結し、小さくすると UX が劣化する。
- Section Heading (22px) — 既にモバイル適正。これ以上下げない
- Card Title (18px) — ファイル名・受信者名の読み取り
- Body / Body Emphasis (16px) — 本文の a11y 下限
- UI Label (14px) — ボタン・フォームラベル
- Meta (14px) — 送信者名・日付などメタデータ
- **グループヘッダー・選択/DL・グループ選択ボタン**等のギャラリー操作系 (13–14px) — 選択 UX の要
- Caption (12px) — 下限、これ以下は a11y 違反

### Principles
- **負トラッキング on 見出し**: 見出しには -0.005em 〜 -0.02em を入れ、親密さを出す。本文 (16px 以下) には入れない。
- **最小ウェイト 400**: 300 (light) は使わない。暖かく確信のあるトーンを保つ。
- **見出しは 600 以上**: 500 は本文強調用に留保。
- **日本語優先のサイズ**: 12px 以下は避ける (CJK の視認性確保)。キャプション最小 12px。

## 4. Component Stylings

### Buttons

**Primary (Sunset Coral)**
- Background: `#D96A4A`
- Text: `#FFFFFF`, Inter 500, 14–16px
- Padding: `12px 20px` (標準) / `14px 24px` (大)
- Radius: `12px` (標準ボタン) / `16px` (CTA大ボタン)
- Hover: background `#B8502F`, shadow `0 4px 12px rgba(184,80,47,0.25)`
- Active: scale(0.98)
- Disabled: opacity 0.4, `cursor: not-allowed`
- Focus: `0 0 0 3px rgba(217,106,74,0.25)` outer ring

**Secondary (Sand)**
- Background: `#F1E8DB`
- Text: `#2A1F1B`
- Border: `1px solid #EAE1D3`
- Radius: `12px`
- Hover: background `#DED3C1`
- Use: 「QR」「コピー」「選択モード」等の補助アクション

**Ghost / Text**
- Background: transparent
- Text: `#6E5F52` (通常) / `#D96A4A` (ブランド寄せ)
- Hover: background `#F1E8DB`, radius `8px`
- Use: ヘッダーのログアウト、ページネーション等

**Circular Control** (Airbnb由来)
- Background: `#FFFFFF` with `border: 1px solid #EAE1D3`
- Size: `40×40px` (標準) / `44×44px` (モバイル)
- Radius: `50%`
- Hover: shadow `0 4px 12px rgba(0,0,0,0.08)`
- Use: カルーセル前後ナビ、閉じるボタン、詳細画面 (S08) の「前へ/次へ」

**Destructive**
- Background: `#A8381F`
- Text: `#FFFFFF`
- 他は Primary と同じ挙動
- Use: 削除確定ボタンのみ (S08 削除確認ダイアログ)

### Cards & Containers

**Photo Card** (均一グリッド) — S07 ギャラリー
- Background: `#FAF6F0` (Cream) — 写真より僅かに暗い台座。縦横比が異なる写真を並べても格子が揃う
- **縦横比は固定 `1/1` (正方形)**: 全カード同サイズ。格子状の整列で DL 選択時のスキャン効率・タップ精度を最大化
- Radius: `16px` (カード外形)
- 画像の Radius: `12px` (画像自体にも角丸を適用、カードより内側に 4px インセット)
- Shadow: なし (フラット) — Cream 台座と写真自体が深度を作る
- **画像は `object-fit: contain` / `object-position: center` で全体を表示** (クロップ禁止)
  - 縦長写真 → 左右が Cream で埋まる (ピラーボックス)
  - 横長写真 → 上下が Cream で埋まる (レターボックス)
  - 正方形 → カード全体を埋める
  - 決して引き伸ばし (`object-fit: fill`) やクロップ (`object-fit: cover`) をしない
- Hover: scale(1.02) + `overflow: hidden`。画像自体の角丸を保つ
- 選択モード: 左上にチェックボックス (`24×24px`, radius `50%`, `#FFFFFF` bg)。全カード同位置なので視線移動が最小
- アクセシビリティ: `alt` にファイル名 + 送信者名を入れる (「IMG_0042.JPG (@hanako_photo)」)

**Receiver Card / Feature Card** (Airbnb風) — S01, S06 ダッシュボードカード
- Background: `#FFFFFF`
- Radius: `20px`
- Shadow (三層):
  ```
  0 0 0 1px rgba(0,0,0,0.02),
  0 2px 6px rgba(0,0,0,0.04),
  0 4px 8px rgba(0,0,0,0.10)
  ```
- Padding: `24px` (デスクトップ) / `20px` (モバイル)
- Hover: shadow を `0 8px 20px rgba(0,0,0,0.08)` に強める

**Modal / Dialog**
- Background: `#FFFFFF`
- Radius: `24px`
- Shadow: `0 20px 60px rgba(0,0,0,0.15)`
- Backdrop: `rgba(42,31,27,0.4)` (エスプレッソに寄せた半透明)

### Inputs

- Background: `#FFFFFF`
- Border: `1px solid #EAE1D3`
- Radius: `12px`
- Padding: `12px 16px`
- Font: Inter 400 16px (`Espresso`)
- Placeholder: `#A79A8C`
- Focus: border `#D96A4A` + `0 0 0 3px rgba(217,106,74,0.15)` ring
- Error: border `#A8381F` + `0 0 0 3px rgba(168,56,31,0.15)` ring
- Disabled: background `#F1E8DB`, text `#A79A8C`

### Navigation (Header)

- Background: `rgba(255,255,255,0.85)` + `backdrop-filter: blur(12px)`
- Border-bottom: `1px solid #EAE1D3`
- Height: `56px` (モバイル) / `64px` (デスクトップ)
- 左: ロゴ (Sunset Coral) — `h-9`。ロゴは `shrink-0` でつぶれを禁止
- Sticky top, z-30 (モバイルドロワーより前面)

**デスクトップ (sm 以上)**
- 右: NavLink (`#6E5F52`) / active (`#D96A4A` + 600 weight) を横並び
- ログアウトボタンは Ghost スタイル (`#A79A8C` / hover で sand 背景)

**モバイル (sm 未満) — ハンバーガー必須**
- NavLink を横並びにしない (日本語メニュー「ダッシュボード」「ギャラリー」等で改行・押しつぶしが発生するため)
- 右端に円形ハンバーガーボタン (`44×44px`, radius `50%`, icon `24px`)
- タップで上から展開するドロワー:
  - ヘッダー直下 (`top: 56px`) に `fixed inset-x-0` の白パネル (背景 `#FFFFFF`)
  - 背景半透明オーバーレイ `rgba(42,31,27,0.4)` + `backdrop-blur-sm` を全面に敷く
  - メニュー項目は縦積み、各行 `px-4 py-3`、ラベル 16px、tap target 44px 以上
  - active は `bg-brand-tint` + `text-brand` + 600 weight、非active は `text-ink` で hover `bg-surface-sand`
  - ドロワー z-20、オーバーレイ z-10、ヘッダー z-30
- 展開中は `body { overflow: hidden }` で背景スクロールをロック
- Escape キー・オーバーレイタップ・ルート遷移でクローズ

### Footer (Fixed)

- Background: `rgba(255,255,255,0.95)` + `backdrop-filter: blur(12px)`
- Border-top: `1px solid #EAE1D3`
- Height: `48px`
- Position: `fixed` inset-x-0 bottom-0 (ページ側は `pb-12` で余白確保)
- テキスト: 12px `#A79A8C`、フィードバックリンクは `#6E5F52` / hover `#D96A4A`

### Upload Drop Zone (S02)

- Background: `#FAF6F0`
- Border: `2px dashed #EAE1D3`
- Radius: `20px`
- Padding: `48px 24px`
- Text: `#6E5F52` / メインCTA `Espresso` 500
- Active (dragover): background `#FCEDE4`, border `2px dashed #D96A4A`

### Progress Bar (S03, S06 ストレージ)

- Track: `#F1E8DB`, height `8px`, radius `50%` (full rounded)
- Fill: 用途に応じて Sage / Amber / Rust、または Coral (アップロード進捗)
- Transition: `width 300ms ease-out`

### Badges (R14 オプション表示等)

- Background: `#FCEDE4` (Coral Tint) または `#F1E8DB` (Sand)
- Text: Coral変種なら `#B8502F`、Sand変種なら `#6E5F52`
- Padding: `4px 10px`
- Radius: `999px` (pill)
- Font: 12px 600

## 5. Layout Principles

### Spacing System
- Base unit: **4px** (Tailwind と合わせる)
- Scale: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96`
- セクション間は `64–96px`、カード内は `16–24px`、密度の高いメタデータ間は `4–8px`

### Container & Grid

**Page Container**
- 最大幅: `1280px` (`max-w-7xl` 相当)
- 左右パディング: `16px` (モバイル) / `24px` (タブレット) / `32px` (デスクトップ)

**Dashboard (S06)**
- カード縦積み (単列)、カード間 `24px`
- 最大幅 `768px` 程度で中央寄せ (読み物感)

**Gallery (S07) — 均一グリッド (正方形)**
- CSS Grid (`grid-template-columns: repeat(N, minmax(0, 1fr))`) + 各カード `aspect-ratio: 1/1`
- カラム数: モバイル・タブレット 3 / デスクトップ 4 / ラージ 5
  - モバイルも 3 列でサムネイル個々のサイズを抑え、一度に視界に入る枚数を増やしてスキャン効率を上げる (DL 選択 UX 優先)
- カード間ギャップ: `8px` (モバイル) / `12px` (タブレット以上)
- 無限スクロール (Intersection Observer) — 50件/リクエスト
- **masonry は採用しない** — 不揃いな形状は選択UXを阻害する

**Upload Page (S02)**
- Drop zone をヒーローに、その下にプレビューグリッド (3–4列)
- 「詳細設定」はアコーディオンで折り畳み、開いた時だけ `20px` パディングのカードで表示

### Whitespace Philosophy

- **マガジン的余白 (Airbnb流)**: ヒーロー・セクション見出しの前後は `64–80px` 余白で「ゆっくり眺める」ペースを作る。
- **ギャラリーは格子状に整列**: ギャラリー内は `8–12px` ギャップに詰めて写真そのものの色彩を主役にする。均一グリッドで視線が格子状に走り、選択モード時のチェックボックス位置も揃う。
- **プロフィールはカード内で呼吸**: 受信者プロフィール (S01) は画像・名前・CTAの間に `16–24px` の余白を確保。

### Border Radius Scale

| Radius | 用途 |
|---|---|
| `8px` | 小リンク、タグ、小ボタン |
| `12px` | 標準ボタン、インプット、小カード |
| `16px` | サムネイルカード、中ボタン、バッジグループ |
| `20px` | 機能カード、ランディングカード |
| `24px` | モーダル、大コンテナ |
| `32px` | ヒーローコンテナ |
| `50%` | サークルコントロール、アバター、チェックボックス |

## 6. Depth & Elevation

| Level | Shadow | 用途 |
|---|---|---|
| Flat (0) | なし | ページ背景、本文ブロック、**ギャラリーサムネイル (写真自体が深度)** |
| Card (1) | `0 0 0 1px rgba(0,0,0,0.02), 0 2px 6px rgba(0,0,0,0.04), 0 4px 8px rgba(0,0,0,0.10)` | Dashboard カード、受信者プロフィールカード |
| Hover (2) | `0 8px 20px rgba(0,0,0,0.08)` | ボタンホバー、カードホバー |
| Modal (3) | `0 20px 60px rgba(0,0,0,0.15)` | モーダル、ドロワー |
| Focus Ring | `0 0 0 3px rgba(217,106,74,0.25)` | 全インタラクティブ要素のフォーカス |

**Shadow哲学**: Airbnbの三層アプローチをカードに採用。レイヤー1は border ring、レイヤー2は ambient、レイヤー3は主リフト。ギャラリーサムネイルには影を付けず、Cream 台座と写真のコントラスト自体で深度を表現する。

## 7. Photography Treatment

写真はFurDropの主役。UIはそれを引き立てる「額縁」であり、写真を**切り取ったり隠したりしない**。

### 7.1 コア原則: 写真全体を必ず見せる

FurDropの本質的ユースケースは「受信者が大量の写真の中からDL対象を選ぶ」こと。したがって**サムネイル段階ですでに写真の全体像が見えている必要がある**。顔・被写体・構図の端が切れていると、受信者は詳細を開かないと判断できず、選択のコストが跳ね上がる。

- **クロップ禁止**: ギャラリー、プレビュー、完了画面、詳細画面 — 全ての写真表示で `object-fit: cover` を使わない。
- **長辺合わせ (`object-fit: contain`)**: 横長は横幅に、縦長は縦幅に合わせる。もう一辺は写真の縦横比に従う。
- **角丸 (rounded) は適用OK**: 写真自体に `border-radius: 12–16px` を付けて柔らかい印象にする。これは写真の「表示領域」の変更ではなく装飾なので原則に反しない。
- **余白が出る場合は台座色で吸収**: カードの縦横比を固定する UI (例: Dashboard の「最近の写真」3枚並び) では、写真のない余白を Cream `#FAF6F0` または Sand `#F1E8DB` で埋める (レターボックス / ピラーボックス)。決して引き伸ばして (`object-fit: fill`) 全面を埋めない。

### 7.2 画面別ガイドライン

- **ギャラリー (S07)**: 均一グリッド (全カード `aspect-ratio: 1/1`)。写真は `object-fit: contain` で枠内に全体を収め、余白は Cream 台座で吸収。masonry は採用しない (選択UX阻害のため)。長辺 400px のサムネイルを使用。
- **Dashboard 最近の写真 (S06)**: 3枚の等幅カードなど固定グリッドを使う場合、カードは `aspect-ratio: 1/1` 程度に固定し、写真は `object-fit: contain` で中に収める。はみ出た余白は Cream で埋める。
- **送信完了 (S04)**: 送信した写真のサムネイル一覧。同様に長辺合わせで全体表示。
- **詳細画面 (S08)**: 拡大表示。**アスペクト比を必ず保持する**。コンテナは `aspect-ratio: width / height` を持たせたうえで、`width: min(100%, calc(70vh * ratio))` で幅を決める。こうすると縦辺は必ず `70vh` 以下に収まり、横辺は親幅を超えず、どの画面サイズ・縦横比の写真でも歪みなく表示できる。固定 `height` + `aspect-ratio` + `max-width` の組み合わせは**禁止** (モバイル幅に clamp された瞬間にアスペクト比が崩れ、サムネイルが歪むため)。`object-fit: contain` を画像自体にも適用。ロード中サムネイルのブラーも `object-contain` を使い、コンテナのアスペクト比に頼ってクロップしない。
- **受信者アバター**: 円形 (`50%`)、`2px solid #FFFFFF` の白縁 + 三層シャドウ。アバターは例外的にクロップ可 (プロフィール画像は一般にクロップ前提で用意されるため)。
- **空状態**: 写真0件時はキャンバス色のイラスト枠 (radius `20px`, bg `#F1E8DB`) に「まだ写真がありません」をエスプレッソ 500 で表示。
- **アップロード中プレースホルダ**: ぼんやりした skeleton (`#F1E8DB` → `#EAE1D3` の shimmer) を使い、完了時にフェードイン (`opacity 300ms ease-out`)。

### 7.3 実装イディオム (参考)

```tsx
// 推奨: ギャラリー (S07) / Dashboard (S06) 共通 — 均一の正方形グリッド
// 写真は contain で全体表示、余白は Cream で吸収
<div className="aspect-square rounded-2xl bg-surface-canvas overflow-hidden flex items-center justify-center">
  <img src={thumbUrl} alt={alt}
       className="max-w-full max-h-full object-contain rounded-xl" />
</div>

// グリッド全体
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
  {photos.map(p => <PhotoCard key={p.id} {...p} />)}
</div>
```

## 8. Motion

- **Duration**: `150ms` (ホバー・色遷移) / `300ms` (レイアウト・フェード) / `500ms` (大モーダル)
- **Easing**: `ease-out` を基本、ポップアップのみ `cubic-bezier(0.22, 1, 0.36, 1)` (緩やかなオーバーシュート)
- **Respect `prefers-reduced-motion`**: アニメーションを無効化するメディアクエリを必ず入れる
- **Scale on tap**: プライマリボタンは active 時 `scale(0.98)` で触覚フィードバック (Airbnb流)
- **Loader**: 円形スピナーよりプログレスバーを優先 (アップロード枚数が見えるため)

## 8.5 Interaction - Destructive Confirm

取り消し不可・副作用の大きい操作は、**必ずブランド付きの確認ダイアログ (`ConfirmDialog`) を挟む**。native `window.confirm()` は使用しない (ブラウザ標準スタイルでブランドが崩れ、日本語の改行も不自然になるため)。

**対象となる操作 (要確認)**
- 写真の削除 (単体・一括) — R2/D1 からの物理削除で復元不可
- ログアウト — 再ログインに OAuth フローが必要
- セッション破棄・アカウント設定のリセット (将来)
- その他、一度実行するとロールバックできない操作

**対象外 (確認不要)**
- 送信・保存・更新など「正の操作」
- 選択のトグル、フィルタ切替、モード切替 (ローカル状態のみ)
- 自動保存・下書きの上書き (ユーザーが明示的に触っていない)

**`ConfirmDialog` の規約** (`frontend/src/components/ui/ConfirmDialog.tsx`)
- `title`: 疑問形で簡潔に (例: `"この写真を削除しますか？"` / `"ログアウトしますか？"`)
- `description`: 結果の不可逆性や副作用を 1 文で (例: `"削除された写真は復元できません。"`)
- `confirmLabel`: 動詞 + `する` で明示 (`"削除する"` / `"ログアウト"`)。「OK」は曖昧なので避ける
- `cancelLabel`: `"キャンセル"` を基本
- `variant`:
  - `"danger"`: 削除・ログアウト等すべての destructive 操作で必須
  - `"primary"`: 非破壊的な最終確認 (将来用途)
- `loading`: 呼び出し側で管理。処理中は Dialog の外側タップ・Escape・キャンセルを無効化する

**ダイアログの見た目** は §4 Modal / Dialog を継承: radius `24px`, shadow `modal`, backdrop `rgba(42,31,27,0.4)` + backdrop-blur。

## 9. Do's and Don'ts

### Do
- Cream Canvas `#FAF6F0` をページ背景に (純白を避ける)
- Sunset Coral `#D96A4A` は**CTAとブランドのみ**に使う (単一アクセント原則)
- 本文は Espresso `#2A1F1B` — 暖かみのある茶黒
- カードには三層シャドウ、サムネイルにはフラット
- Border-radius は寛大に — ボタン 12px、カード 20px、コントロール 50%
- 写真を常に主役にする — UIシェルは抑えめのサンド/クリーム
- **写真は必ず全体を表示する** — `object-fit: contain`、長辺合わせ、余白は Cream 台座で吸収
- サムネイル・写真自体にも角丸 (`12–16px`) を付けて柔らかく
- 見出しには負トラッキング -0.005em 〜 -0.02em
- モバイルタップターゲットは 44px 以上 (`h-11` 以上)
- ステータス色は Sage / Amber / Rust を文脈に応じて切り替え

### Don't
- 純黒 `#000000` を本文に使わない → Espresso `#2A1F1B`
- 純白 `#FFFFFF` をページ背景に使わない → Cream `#FAF6F0` (カード表面のみ純白OK)
- 冷たいスチールグレー (例: `#6B7280`, `#9CA3AF` Tailwind gray) を使わない → Mocha / Warm Silver
- Coral を大きな面積の背景に使わない (バナー・ヘッダー全面等) — 写真の色を殺す
- 青系アクセント (Tailwind `blue-600` 等) を CTA に使わない — ブランドアイデンティティを壊す
- Light ウェイト (300) を使わない — 暖かさが消える
- Sharp corners (0–4px) を使わない — 親密さが消える
- 影を強く (opacity > 0.15 を主層に) しない — 冷たさが出る
- ギャラリーサムネイルに影を付けない — 写真自体に任せる
- **写真を `object-fit: cover` でクロップしない** — DL選択の判断ができなくなる (アバターのみ例外)
- **写真を `object-fit: fill` で引き伸ばさない** — 縦横比を破壊する
- 固定グリッドで余白を黒や濃いグレーで埋めない — Cream/Sand の台座を使う
- **masonry レイアウトを使わない** — 不揃いなカード形状はDL選択時のスキャン・タップUXを阻害する。ギャラリーは常に均一グリッド
- **モバイルヘッダーに複数の日本語メニューを横並びで詰め込まない** — ロゴが押しつぶされてメニューが改行する。sm 未満は必ずハンバーガードロワー化
- **詳細画像で固定 `height` + `aspect-ratio` + `max-width` を併用しない** — モバイル幅に clamp されるとアスペクト比が崩れる。必ず `width: min(100%, calc(70vh * ratio))` で幅を決めて縦辺を間接制御する
- **ギャラリーをモバイル 2 列にしない** — 3 列のほうが DL 選択時のスキャン効率が高い。カラム数は 3 → 4 → 5 のみ
- **destructive 操作に native `window.confirm()` を使わない** — ブラウザ標準のモーダルではブランドが崩れ、日本語の改行も不自然。`ConfirmDialog` (variant=danger) を必ず挟む (§8.5)

## 10. Responsive Behavior

### Breakpoints (Tailwind 基準)
| Name | Width | Key Changes |
|---|---|---|
| Mobile | `<640px` (`sm` 未満) | ギャラリー 2列、単列カード、フッター簡略 |
| Tablet | `640–1024px` (`sm`〜`lg`) | ギャラリー 3列、ヘッダー全表示 |
| Desktop | `1024–1440px` (`lg`〜`2xl`) | ギャラリー 4列、マガジン余白 |
| Large | `>1440px` (`2xl+`) | ギャラリー 5列、最大幅 1280px で中央寄せ |

### Collapsing Strategy
- ギャラリー: 5 → 4 → 3 列 (モバイルも 3 列。2 列まで落とさない)
- **ヘッダー: デスクトップはフルナビ、モバイル (sm 未満) はハンバーガードロワー** (§4 Navigation 参照)。日本語メニュー「ダッシュボード」「ギャラリー」「設定」「ログアウト」を横並びにするとモバイル幅ではロゴが押しつぶされ改行が発生するため、**必ずハンバーガー化する**
- Dashboard カード: 横並び → 縦積み
- S02 詳細設定: アコーディオン (全サイズ)
- S08 前後ナビ: キーボード矢印 (デスクトップ) + スワイプ (モバイル)
- **S08 詳細画像**: モバイルでもアスペクト比を保持 (§7.2 詳細画面 参照)。固定 `height` + `aspect-ratio` + `max-width` の組み合わせは使わない

### Touch Targets
- ボタン最小 44×44px
- Circular control 40–44px
- ギャラリーサムネイル: カード全体がタップ対象
- 選択モードのチェックボックス: `24×24px` だが周囲に `padding 10px` のタップ領域

## 11. Agent Prompt Guide

### Quick Color Reference
```
背景キャンバス:  #FAF6F0 (Cream)
カード表面:      #FFFFFF
本文:            #2A1F1B (Espresso)
補助本文:        #6E5F52 (Mocha)
無効・プレースホルダ: #A79A8C (Warm Silver)
ボーダー:        #EAE1D3 (Sand Deep)
セカンダリ面:    #F1E8DB (Sand)
ブランド:        #D96A4A (Sunset Coral)
ブランドホバー:  #B8502F (Deep Terracotta)
成功:            #4B7A5A (Sage)
警告:            #D98F2E (Amber)
エラー:          #A8381F (Rust)
```

### Example Component Prompts
- 「受信者プロフィールカード (S01) を作って: 白背景 `#FFFFFF`、radius `20px`、三層シャドウ。アバターは円形 `80×80px`、Cream `#FAF6F0` 台座。受信者名は 22px Inter 600 Espresso、ハンドル (`/send/...`) は 14px Mocha。CTA「写真を送る」は Sunset Coral ボタン、14px 500、padding 12px 20px、radius 12px。」
- 「ギャラリー (S07) を作って: **均一の正方形グリッド** (`aspect-ratio: 1/1`)、モバイル 2列 / タブレット 3列 / デスクトップ 4列 / ラージ 5列、ギャップ 8–12px。各カードは背景 Cream `#FAF6F0`、カード radius 16px、画像 radius 12px、影なし。画像は `object-fit: contain` で必ず全体を表示 (クロップ禁止)、縦長なら左右、横長なら上下が Cream で埋まる。ホバーで scale(1.02)。選択モード時は左上の同一位置に円形チェックボックス。masonry は使わない。」
- 「Dashboard (S06) ストレージバーを作って: トラック `#F1E8DB` 高さ 8px radius full。使用率 < 80% は Sage、80–94% は Amber、95% 以上は Rust。transition width 300ms ease-out。」
- 「アップロード進捗バー (S03) を作って: 全体枚数 / 完了枚数をパーセント表示。バーは Sunset Coral `#D96A4A`、トラック `#F1E8DB`。各ファイルごとに行を作り、状態バッジ (`待機` / `送信中` / `完了` / `失敗`) を sand / amber / sage / rust の pill で表示。」
- 「ログイン画面 (S05) を作って: Cream 背景、中央にロゴ `h-20`、下にサブコピー 16px Mocha、Twitter ログインボタンは Espresso `#2A1F1B` 背景 + 白文字、radius 12px、padding 12px 20px、full width 最大幅 `sm`。」

### Iteration Guide
1. Cream `#FAF6F0` から始める — 純白を避けることでFurDropらしさが出る
2. Sunset Coral は CTA とブランドにのみ使う — 面積で使うと暑苦しい
3. 本文は Espresso、補助は Mocha — 灰色ではなく茶系を徹底
4. カードは三層シャドウ + radius 20px、サムネイルはフラット + radius 16px
5. タイポは Inter + Noto Sans JP、400–700、見出しに負トラッキング
6. 写真は常に主役 — UIは額縁として引き算する
7. **写真は必ず全体を見せる** — `object-fit: contain`、クロップ厳禁 (アバター除く)。受信者がDL対象を選ぶための基本UX
8. モバイルファースト、タッチターゲット 44px 以上を死守

---

## 12. 実装メモ (Tailwind)

Tailwind で使う場合の推奨拡張:

```ts
// frontend/tailwind.config.ts の theme.extend.colors
colors: {
  brand: {
    DEFAULT: "#D96A4A",      // Sunset Coral
    deep: "#B8502F",         // Deep Terracotta (hover/press)
    tint: "#FCEDE4",         // Coral Tint (selection)
  },
  ink: {
    DEFAULT: "#2A1F1B",      // Espresso (primary text)
    soft: "#6E5F52",         // Mocha (secondary text)
    muted: "#A79A8C",        // Warm Silver (disabled)
  },
  surface: {
    canvas: "#FAF6F0",       // Cream page bg
    DEFAULT: "#FFFFFF",
    sand: "#F1E8DB",         // Secondary surface
    "sand-deep": "#EAE1D3",  // Border
    "sand-hover": "#DED3C1",
  },
  status: {
    success: "#4B7A5A",
    "success-tint": "#E8F0EA",
    warn: "#D98F2E",
    danger: "#A8381F",
    "danger-tint": "#FBE8E2",
  },
  accent: {
    cobalt: "#4262D4",       // link / focus (a11y)
  },
},
boxShadow: {
  card: "0 0 0 1px rgba(0,0,0,0.02), 0 2px 6px rgba(0,0,0,0.04), 0 4px 8px rgba(0,0,0,0.10)",
  "card-hover": "0 8px 20px rgba(0,0,0,0.08)",
  modal: "0 20px 60px rgba(0,0,0,0.15)",
},
```

`theme_color` (PWA manifest / `<meta name="theme-color">`) は `#D96A4A` を使用する。
