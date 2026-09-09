# メール送信サービス選定 — FurDrop 受信者向けメール通知

> **2026-08-30 時点の調査。** 料金・無料枠は変動が激しい (実際、調査中に SendGrid の無料枠廃止と SES の料金プラン改定が見つかった)。実装着手前に各社の料金ページを再確認すること。
> 各主張には一次情報 (公式ドキュメント・公式料金ページ) の URL を付けた。一次情報が取れなかった項目は **[二次情報]** または **[一次情報なし]** と明記している。

---

## 推奨: Cloudflare Email Service (Resend を退避先に用意する)

1. **追加コストが実質ゼロ。** FurDrop は `workers/wrangler.template.toml` で `[limits] cpu_ms = 120000` を指定しており、これは **Workers Paid 限定の設定**なので ($5/月。Free は 10ms 固定で変更不可 — [Workers limits](https://developers.cloudflare.com/workers/platform/limits/))、既に払っている料金に Email Sending の **月3,000通が含まれる**。想定規模 (100受信者 × 30日 = 月3,000通) は included にちょうど収まる大きさで、削除予告 (R13) が乗った月に多少超えても **$0.35/1,000通**なので**月数十円**の増分にしかならない。他社は無料枠の日次上限に当たるか、月$15〜20 の崖がある。
2. **Workers との適合が段違い。** 送信は `env.EMAIL.send()` バインディング1発で **API キーを保存しなくてよい** (シークレット漏洩面が消える)。furdrop.app は既に Cloudflare DNS 上にあるため (`dig NS furdrop.app` → `lennon/arushi.ns.cloudflare.com`)、DKIM/SPF/DMARC/Return-Path の **DNS レコードは自動で作成される**。さらに調査した全社中**唯一**、RFC 8058 が要求する「List-Unsubscribe を DKIM 署名の `h=` に含める」ことを明文化している。
3. **ただし Email Sending は public beta (2026-04-16〜、**GA は未発表**)、かつ日次クォータが非公開の逓増式。** これが唯一かつ実在するリスク。通知ダイジェストは失敗しても写真自体は失われない性質なので許容できると判断するが、**送信処理を薄いインターフェースに隔離し、Resend へ即座に差し替えられる形にしておくこと**を条件とする。

> 判断が割れる場合の次点は **Resend**。成熟度・ドキュメント・ログ (30日) は最良だが、無料枠の **100通/日** が FurDrop の設計上限 (100受信者 × 1通/日) にちょうど当たるため、実質 **$20/月 (Pro)** が確定する。年 $240 は本サービスのインフラ費用規模に対して重い。

---

## 前提: FurDrop 側の条件

| 項目 | 値 |
|---|---|
| ランタイム | Cloudflare Workers (workerd)。Node.js ではない |
| 想定受信者数 | 最大 100 |
| 送信パターン | 1日1回のダイジェスト + 削除予告 (R13) |
| **想定日次通数** | **最大 ~100通/日** (100受信者 × ダイジェスト1通)。削除予告バーストが上乗せ |
| 想定月間通数 | 〜3,000通 (数千通以下) |
| 送信ドメイン | furdrop.app (1ドメイン)。**Cloudflare DNS 上にある**ことを確認済み |
| 既存の足場 | `users.email` (Firebase Auth 由来) が既にある / 毎時 Cron Trigger (`crons = ["0 * * * *"]`) が既に動いている / **Workers Paid 契約済み** (`cpu_ms = 120000` は Paid 限定) |

### 選定上もっとも効く制約は月間上限ではなく「日次上限」

100受信者 × 1日1通 = **約100通/日**。これは「1日100通まで無料」という典型的な無料枠のちょうど境界にあたる。
月間数千通という数字だけを見て選ぶと、上限に張り付いた状態で運用することになり、削除予告が重なった日に落ちる。
比較表では日次上限を月間枠と並べて明示する。

---

## 比較表

軸は依頼された順 (1.無料枠 → 2.有料価格 → 3.独自ドメイン → 4.到達率 → 5.実装しやすさ → 6.ログ → 7.バウンス)。

### 1. 無料枠 / 2. 有料時の価格

| サービス | 無料枠 (月) | **無料枠 (日)** | 恒久/期限 | 無料時のドメイン数 | 1,000通/月 | 10,000通/月 |
|---|---|---|---|---|---|---|
| **Cloudflare Email Service** | **3,000** (Workers Paid に内包) | **非公開・逓増式** | 恒久 (Paid 前提) | 記載なし | **$0** (既払の$5に内包) | **+$2.45** (超過7,000通ぶん) |
| **Resend** | 3,000 | **100** ← 効く | 恒久 | 3 | **$0** | **$20** (Pro/50,000) |
| **Amazon SES** | 実質なし ($200 の AWS クレジットのみ) | **— (production access 必須)** | 新規は 12ヶ月無料枠**廃止** | — | **$0.10** (à la carte) | **$1.00** |
| **Postmark** | **100** ← 小さすぎ | 記載なし | 恒久 | 記載なし | **$15** (Basic/10,000) | **$15** |
| **SendGrid** | **なし** (60日トライアルのみ) | トライアル: 100 | **60日で終了** | 記載なし | **$19.95** | **$19.95** |
| **Brevo** | 9,000 相当 | **300** | 恒久 | 記載なし | **$0 だが要ロゴ** → 実質 $18 | **≈$17** (Starter) [二次情報] |
| **Mailgun** | 100/日 (月間表記なし) | **100** | 恒久 | 1 | $0 / $15 | **$15** (Basic) |
| *(参考) Mailjet* | 6,000 | **200** | 恒久 | 記載なし | $0 (**要ロゴ**) | $17 (Essential/15,000。Starter $9 は8,000通なので不足) |

- **Cloudflare の「+$2.45」** は Workers Paid $5/月に**加えて**かかる額ではなく、既に払っている $5 の中に3,000通が含まれ、7,000通ぶんだけ超過課金される計算 (`7 × $0.35`)。
- **Mailjet の無料枠は Mailjet ロゴが強制表示される** (「No Mailjet logo」が Essential 以上の機能として明記)。プロダクトの通知メールには使えない。
- **SES の日次欄が「—」なのは意図的**。Sandbox の 200通/24h は無料枠ではなく「事前検証した宛先にしか送れない」制限で、FurDrop の宛先 (Firebase Auth 由来) は検証しようがない。**production access を取るまで実質的に送信できない**。
- **SES の「$0.10/1,000」は全社最安**だが、後述する運用コスト (Sandbox 解除申請・SNS 署名検証の自作・本文が見られない) が価格差を大きく上回る。

### 3. 独自ドメイン (furdrop.app) の設定手間

| サービス | 必要 DNS レコード | 計 | 検証時間 | Cloudflare DNS の落とし穴 |
|---|---|---|---|---|
| **Cloudflare Email Service** | MX×3 (`cf-bounce`) + SPF TXT + DKIM TXT + DMARC TXT — **Cloudflare が自動作成** | **6 (自動)** | **5〜15分** | **なし** (自社 DNS 前提。むしろ Cloudflare DNS が必須条件) |
| **Resend** | MX×1 + SPF TXT (`send` サブドメイン) + DKIM TXT | **3** (+DMARC 任意) | 15分〜72時間 | **プロキシを DNS Only (グレー雲) にする**必要あり。ホスト名は `send` のみ貼る (ドメイン部を含めない)。**CNAME フラット化は無関係** (DKIM が TXT、全てサブドメイン) |
| **Amazon SES** | DKIM CNAME×3 + MX×1 + SPF TXT + DMARC TXT | **6** | 最長72時間 (MAIL FROM の MX は**72時間で Failed 確定**) | **最悪**。①`dkim.amazonses.com` は Cloudflare が意図的にプロキシ禁止 ②**CNAME フラット化が SES DKIM を壊す** (Cloudflare 公式が明記) ③レコードはリージョンごとに必要 |
| **Postmark** | DKIM TXT×1 + Return-Path CNAME×1 (`pm_bounces` → `pm.mtasv.net`) | **2** (+DMARC 任意) | 手動検証は即時 / 自動48時間 | **公式に明記**: 「Cloudflare を使っているならオレンジ雲をクリックして無効化」 |
| **SendGrid** | CNAME×3 (SPF/Return-Path + DKIM×2) + DMARC TXT | **4** | 最長48時間 | **罠あり**。ドメイン認証の CNAME はグレー雲必須だが、**SendGrid の唯一の Cloudflare 公式ドキュメントはリンクブランディング用で「オレンジ雲を有効にせよ」と逆のことを書いている**。混同すると Code 1004 で永久に検証できない [二次情報] |
| **Brevo** | Brevo code TXT + DKIM (TXT×1 または CNAME×2) + DMARC TXT | **3〜4** | 最長48時間 | **Brevo が公式に明記**: 「CNAME 型 DKIM を使う場合は Cloudflare の **CNAME フラット化を無効化**すること。有効だと Cloudflare が TXT に変換して DKIM 認証が失敗する」。各 DKIM CNAME の **Proxy も無効化**すること。SPF/MX は不要 |
| **Mailgun** | SPF TXT + DKIM TXT + tracking CNAME + MX×2 | **5** | 24〜48時間 | 公式記載なし。サブドメイン (`mg.furdrop.app`) 運用が推奨 (MX がルートの受信を奪わないため) |

- **SPF について**: Postmark は「SPF レコードは不要」を公式に明言 (Return-Path の CNAME 側で SPF が引かれ、DMARC のアラインメントもそこで成立する)。SES も apex の SPF は不要 (暗黙設定)。
- **DMARC はどのサービスも検証必須にしていない** (自分で `_dmarc` TXT を足す)。唯一 Cloudflare が `_dmarc` まで自動作成する。

### 4. 到達率

| サービス | 既定 IP | 専用 IP | 共有プールの評判管理 | Gmail/Yahoo 2024 要件への言及 |
|---|---|---|---|---|
| **Cloudflare Email Service** | 共有 (マネージド) | 記載なし | 「IP reputation」「Feedback processing」を自動管理と記載。目標値を公表: **配信率>95% / ハードバウンス<2% / 苦情<0.1%** | 個別ページなし。ただし SPF/DKIM/DMARC を自動構成し、List-Unsubscribe を「Always DKIM-signed per RFC 8058」と明記 |
| **Resend** | 共有 | **$30/月** (要 Scale + 3,000通/日以上) | 「高品質な送信者で構成し、監視し、悪質な送信者を排除」[一部二次情報] | **専用ブログあり**。SPF/DKIM は自動、**DMARC は利用者側の責任**と明記 |
| **Amazon SES** | 共有 | $24.95/月 (標準) / $15/月+$0.08per1k (マネージド) | **最も詳細**。Reputation dashboard で bounce/complaint を可視化。**バウンス率5%で審査・10%で停止、苦情率0.1%で審査・0.5%で停止** | 公式ブログあり。SES 固有の助言として「ドメイン ID を使う」「custom MAIL FROM で SPF アラインメントを取る」 |
| **Postmark** | 共有 (**Transactional と Broadcast で IP レンジごと完全分離**) | $50/月 (要 30万通/月) | 専用 IP を積極的に否定: 「ほとんどの人には無垢な共有 IP プールが最良」 | 専用ブログあり。5,000通/日の閾値、`p=none` 推奨、苦情率0.3%を明記 |
| **SendGrid** | 共有 (Essentials) | Pro ($89.95/月) に1本同梱 | 公式記載なし | List-Unsubscribe の公式ドキュメントで言及 |
| **Brevo** | 共有 | **Professional 以上のみ・$251/年** | **公開基準あり**: 開封率≥10-12% / 解除≤1-2% / ハードバウンス≤2-3% / 苦情≤0.2%。基準割れで専用IPへの移行要請や**アカウント停止** | 専用ドキュメントあり。「トランザクショナルメールにも適用されるか? **はい**」と明記 |
| **Mailgun** | 共有 | Scale ($90/月) に1本同梱 / 追加 $59/月 | 公式記載なし | ブログ・用語集で言及 |

**FurDrop への含意**: 想定 ~100通/日 では**専用 IP は全社で非推奨・非現実的** (SES/Resend/Postmark いずれも「小規模なら共有プールの方が良い」と明言)。したがって到達率は「共有プールの質」と「認証を正しく張れているか」でほぼ決まる。**この軸で各社に決定的な差はつかない**。

### 5. Workers での実装しやすさ

| サービス | 認証 | ボディ形式 | バッチ | 依存 | 公式 SDK の Workers 対応 |
|---|---|---|---|---|---|
| **Cloudflare Email Service** | **不要 (バインディング)** | 構造化オブジェクト | 1通あたり宛先50 | **ゼロ (`fetch` すら不要)** | バインディングが公式 |
| **Resend** | `Authorization: Bearer` | JSON | **100通/リクエスト** | fetch のみ | **Workers 専用ガイドが公式に存在** |
| **Amazon SES** | **SigV4 署名 (必須。Bearer 等の代替なし)** | JSON | 宛先50 | **aws4fetch (3KB gz) 事実上必須** | AWS SDK v3 は **Workers で動く保証なし** (`@smithy` が `node:fs` を参照)、220KB。Cloudflare は aws4fetch を公式に推奨 |
| **Postmark** | `X-Postmark-Server-Token` | JSON | **500通/リクエスト** | fetch のみ | 公式言明なし (依存ゼロ・native fetch なので動く可能性は高い) |
| **SendGrid** | `Authorization: Bearer` | JSON | personalizations **1,000件** | fetch のみ | **`@sendgrid/mail` は動かない** (`http`/`crypto`/`fs` 依存) [二次情報]。`fetch` を使うこと |
| **Brevo** | `api-key` ヘッダ | JSON | `messageVersions` (総宛先2,000 / 版あたり99) | fetch のみ | 公式言明なし。`@getbrevo/brevo` は依存ゼロで Workers 判定コードを持つ [二次情報] |
| **Mailgun** | HTTP Basic (`api:KEY`、`btoa()` で可) | **multipart/form-data (JSON ではない)** | 宛先1,000 | fetch + FormData | 公式言明なし。SDK は使わず `fetch`+`FormData` 推奨 |

- **SES の SigV4 コストの正直な評価** (依頼された論点): **送信呼び出し自体はほぼ問題にならない**。[aws4fetch](https://github.com/mhart/aws4fetch) は Cloudflare が R2 の文脈で公式に推奨しており、`email.*` ホストを署名名 `ses` に自動マッピングするため、送信は約25行で書ける。**真のコストは送信部分ではなく、①Sandbox 解除申請という前提ゲート ②バウンス通知の SNS 署名検証 (X.509 パース含め自作、〜100行) ③送信済みメールの本文が見られないこと** の3点。
- **Cloudflare だけが「シークレットを持たない」。** 他社は全て API キーを `wrangler secret` に置く必要がある。

### 6. 送信ログ・可観測性

| サービス | 個別メールの検索 | **本文の閲覧** | 保持期間 | イベント取得 |
|---|---|---|---|---|
| **Cloudflare Email Service** | ○ (Activity log) | **○** (Preview: HTML / Text / Headers / Attachments / **Raw**) | プレビュー **約7日**。ログ本体の保持期間は**記載なし** | **Queues event subscriptions** (2026-07-15 追加)。HTTP webhook ではない |
| **Resend** | ○ | **○** (Preview / Plain Text / HTML) | **30日** (Free/Pro/Scale 共通) | Webhook **18種** |
| **Amazon SES** | △ (VDM の Messages 表。検索は直近30日) | **× (既定では不可)** — 本文を見るには **Mail Manager email archiving** ($2/GB + $0.19/GB/月) が別途必要 | CloudWatch メトリクスは最長455日。VDM 検索窓は30日 | 5宛先 (CloudWatch/Firehose/Pinpoint/SNS/EventBridge)、**イベント10種** |
| **Postmark** | ○ | **◎ 最良** — HTML・プレーンテキスト・**生ソース**・**受信サーバの SMTP 応答 (`DeliveryMessage`)** まで API で取得可能 | **45日** (アドオンで 7〜365日) | Webhook 8種 |
| **SendGrid** | ○ | **× (公式に記載なし)** | **3日** (Premier のみ7日)。アドオンで最大30日 | Event Webhook 12種 |
| **Brevo** | ○ (宛先/件名/message ID/タグ等で検索、CSV 20万件) | **△ 既定は無効** — 「Never store previews」が初期選択。有効化すれば本文プレビュー可 | **既定は無期限** (全プラン共通、1〜24ヶ月に設定可) | Webhook 15種 |
| **Mailgun** | ○ | ○ (MIME 保持) [二次情報] | **Free/Basic は1日**、Foundation 5日、Scale 30日 | Webhook 9種 |

- **SendGrid の3日と Mailgun の1日は実運用で厳しい。** 「金曜に届かなかった」と月曜に報告されたら調査できない。
- **Postmark が突出している**が、他の軸 (無料枠100通/月、Webhook 署名なし) で落ちる。
- **Cloudflare はログ本体の保持期間が未文書化**。プレビューの7日のみが公式値。これは beta ゆえの穴で、リスクとして数える。

### 7. バウンス / 苦情のハンドリング

| サービス | 自動抑制リスト | Webhook 署名方式 | Workers での検証可否 |
|---|---|---|---|
| **Cloudflare Email Service** | **○** ハードバウンス「即時」+ スパム苦情。手動追加・削除も可 | Queues 経由なので**署名検証が不要** (Cloudflare 内部で完結) | **検証不要 = 最も安全** |
| **Resend** | **○** ハードバウンス + 苦情。`GET /suppressions` 等で API 管理可 | **Svix** (`svix-id` / `svix-timestamp` / `svix-signature`) | HMAC-SHA256 なので可。ただし**構成の詳細は Resend 側に記載がなく svix.com へのリンクのみ** |
| **Amazon SES** | **○** アカウントレベル (**ハードバウンスのみ**、苦情も対象)。加えて**無効化できない global suppression list** が別に存在 (最長14日) | **SNS**: SubscriptionConfirmation フロー + `SHA1withRSA` (既定) / `SHA256withRSA` (要オプトイン) | 可。ただし **X.509 証明書を取得して SPKI を自前でパースする必要**があり、〜100行。**署名対象文字列の仕様が AWS 公式ページ間で矛盾している** |
| **Postmark** | **○** ストリームごと。**`SpamComplaint` は削除不可 (恒久)** | **署名なし。公式に「HMAC webhook signature verification はサポートしていない」と明言** | **不可**。URL 埋め込みの Basic 認証 + IP 許可リストで代替するしかない ← **本調査中で最大の実装上の弱点** |
| **SendGrid** | **○** Bounces/Blocks/Spam Reports/Invalid/Unsubscribes | **ECDSA** (`X-Twilio-Email-Event-Webhook-Signature`)、`SHA256(timestamp‖body)` | 可。ただし**曲線名が公式に明記されておらず** (P-256 と推定)、署名が **DER なので Web Crypto 用に raw r‖s へ変換が必要** |
| **Brevo** | **○** トランザクショナル専用のブロックリスト (`hardBounce`/`contactFlaggedAsSpam`/`unsubscribedViaEmail` 等)。API で一覧・解除可 | **署名なし。** IP 許可リスト / URL 埋め込み Basic 認証 / Bearer トークン / 任意ヘッダのみ | **暗号学的検証は不可**。Bearer + 冪等化で代替 |
| **Mailgun** | **○** Bounces/Unsubscribes/Complaints、それぞれ API あり | **HMAC-SHA256(timestamp+token)**、hexdigest。**ヘッダではなく JSON ボディ内** | 可。最も素直 |

---

## Cloudflare Workers からのメール送信という制約について

### 依頼文の前提を1点だけ訂正 (結論は変わらない)

「Workers は Node.js ランタイムではないので SMTP 直叩き (TCP) は不可」という前提は、**厳密には現在正しくない**。

- Workers には `cloudflare:sockets` の `connect()` による**アウトバウンド TCP 接続がある**。`secureTransport: "starttls"` と `startTls()` もサポートされる — [Cloudflare Docs: TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/)
- 2025-01-28 に `nodejs_compat` 下で `node:net` / `node:dns` / `node:timers` が使えるようになった — [Cloudflare Changelog](https://developers.cloudflare.com/changelog/2025-01-28-nodejs-compat-improvements/)。ただし `net.Server` は非対応、`dns.resolve` 等は "Not implemented" を投げる
- **しかし 25番ポートは明示的にブロックされている**: "By default, Workers cannot create outbound TCP connections on port `25` to send email to SMTP mail servers" / "Connections to port 25 are prohibited" — [同上](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/)。587 / 465 が許可されるかは公式ドキュメントに**記載なし**

**したがって「HTTPS API を持つサービスを選ぶ」という方針は維持する。** 理由は port 25 の遮断そのものより、Workers 上に保守された SMTP クライアント実装が存在せず、STARTTLS ネゴシエーション・認証・エラー処理を自前で抱えることになるため。HTTPS API なら `fetch` 1回、Cloudflare Email Service ならバインディング1回で済む。

> なお Cloudflare Email Service は `smtps://smtp.mx.cloudflare.net:465` での認証付き SMTP も提供しているが (2026-06-08 beta)、Workers から使う理由はない。

---

## Gmail / Yahoo の 2024年送信者要件 (共通の前提)

### Google

[Google: メール送信者のガイドライン](https://support.google.com/a/answer/81126) より (2024-02-01 施行):

**すべての送信者:**
- SPF **または** DKIM のいずれかを設定
- 送信 IP に有効な正引き・逆引き (PTR) レコード / TLS で送信 / RFC 5322 準拠
- スパム率を **0.3% 未満**に維持 (推奨は **0.10% 未満**)

**1日5,000通以上を Gmail 宛に送る「bulk sender」への追加要件:**
- SPF **と** DKIM の**両方**、送信ドメインに **DMARC** (**ポリシーは `p=none` でよい**)
- From ヘッダのドメインが SPF ドメインまたは DKIM ドメインと**アラインしている**こと
- **「マーケティングメールと購読型メール」はワンクリック解除に対応** (引用 RFC は **RFC 2369** と **RFC 8058**)

### Yahoo

[Yahoo Sender Hub: Best Practices](https://senders.yahooinc.com/best-practices/) より (2024年2月から段階的に施行):

- すべての送信者: SPF **または** DKIM、スパム率 **0.3% 未満**
- bulk sender: SPF **と** DKIM の両方、**`p=none` 以上の有効な DMARC ポリシー**、DKIM 鍵長 **1024bit 以上**
- ワンクリック解除は「マーケティングメールと購読型メール」向けで、「Post (RFC 8058) 方式を強く推奨」
- **Yahoo のページ自体には通数の閾値の記載がない** (5,000通/日は二次情報。例: [Mailgun](https://www.mailgun.com/state-of-email-deliverability/chapter/yahoogle-bulk-senders/))

### FurDrop への適用

**FurDrop は約100通/日なので「bulk sender」(5,000通/日) の閾値には遠く届かない。**
したがって DMARC とワンクリック解除は、Gmail の規定上**厳密には必須ではない**。

ただし次の理由で**どちらも実装する前提で選定した**:

1. 1日1回のダイジェストは Google の言う「subscribed messages (購読型メール)」に該当すると読むのが自然で、閾値を超えた時点で即座に要件対象になる
2. **スパム率 0.3% は通数に関係なく全送信者に適用される**。100通/日という小さい母数では1件の「迷惑メール報告」が率を大きく揺らす。しかも **Postmark の利用規約は 0.1%、SES は苦情率 0.1% で審査対象**と、Gmail より厳しい基準を課している
3. SPF / DKIM / DMARC を最初から揃えるコストは DNS レコード数本で、後付けより安い

### RFC 8058 の実装要件 — 見落としやすい「DKIM `h=` 問題」

[RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html) の要件:

```
List-Unsubscribe: <https://example.com/unsubscribe/opaquepart>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

- `List-Unsubscribe-Post` の値は `List-Unsubscribe=One-Click` **ちょうど**でなければならない
- URI は **HTTPS**。受信側は**その URI へ HTTPS POST** し、本文にキー/値を `multipart/form-data` または `application/x-www-form-urlencoded` で送る
- **重要**: 両ヘッダは **DKIM 署名の対象**でなければならず、`DKIM-Signature` の **`h=` タグに含まれている**必要がある — "The List-Unsubscribe and List-Unsubscribe-Post headers MUST be covered by the signature and included in the 'h=' tag"

**この3点目が選定に直接効く。カスタムヘッダを API で付けられても、そのサービスが `h=` タグにそのヘッダを含めて DKIM 署名しなければ RFC 8058 準拠にならない。**

- 調査した中で **`h=` への包含を明文化しているのは Cloudflare Email Service のみ** (List-Unsubscribe について "Always DKIM-signed per RFC 8058") — [Email headers](https://developers.cloudflare.com/email-service/reference/headers/)
- 実際にこれが問題になった報告として、SendGrid で `List-Unsubscribe-Post` が `h=` に入らず Gmail が解除ボタンを出さない、という issue がある — [sendgrid-nodejs#893](https://github.com/sendgrid/sendgrid-nodejs/issues/893) (**2019年・クローズ済み・現在も再現するかは未検証**。[二次情報])
- **どのサービスを選んでも、実装時に実際の受信メールの `DKIM-Signature: ... h=` を目視確認する工程を入れること。**

### 各社のワンクリック解除ヘッダの扱い (依頼された論点)

| サービス | トランザクショナル API で自前ヘッダを付けられるか | サービス側の自動付与 |
|---|---|---|
| **Cloudflare Email Service** | **○ 許可リスト方式で `List-Unsubscribe` / `List-Unsubscribe-Post` を明示的に許可**。値も検証される (`List-Unsubscribe-Post` は `List-Unsubscribe=One-Click` 完全一致、HTTP 非 TLS URI は拒否) | なし (自分で付ける) |
| **Resend** | ○ `headers` フィールド。専用ドキュメントあり | **Broadcasts では自動付与**。トランザクショナルは手動 |
| **Amazon SES** | **○** SESv2 の `Content.Simple.Headers` (**最大15件**)。**AWS 公式ブログにこの用途の例がある**。Raw MIME は不要 | `ListManagementOptions` を使うと SES が**上書きする**ので併用しない |
| **Postmark** | ○ `Headers` 配列。公式に「トランザクショナルに付けたら送信に含める」と明言 | **Broadcast ストリームでは自動付与** |
| **SendGrid** | ○ `headers` フィールド。**予約ヘッダのリストに含まれていない**ことを確認済み | subscription tracking を有効にすると自動付与 (併用は非推奨) |
| **Mailgun** | ○ `h:List-Unsubscribe` / `h:List-Unsubscribe-Post` (`h:` プレフィクス方式は公式) | unsubscribe tracking 有効時に自動付与 [二次情報] → **重複ヘッダのリスクあり、要実測** |

---

## 各社詳細

### ★ Cloudflare Email Service (推奨)

Cloudflare 自身が提供する送受信サービス。**Email Routing (受信) は GA、Email Sending (送信) は public beta。**

- **状態**: 2025-09-25 private beta 発表 → **2026-04-16 public beta**。[changelog](https://developers.cloudflare.com/changelog/product/email-service/) に **GA の告知はまだない** (2026-08-30 時点)。直近も活発に開発中: 2026-07-15 Queues イベント購読、2026-07-17 Activity log でのメールプレビュー
  - [Cloudflare Email Service docs](https://developers.cloudflare.com/email-service/) / [公開beta ブログ (2026-04-16)](https://blog.cloudflare.com/email-for-agents/)
- **料金**: Workers Free では**利用不可**。**Workers Paid で月3,000通込み、超過 $0.35/1,000通**。「Sends to verified destination addresses are always free: they do not count toward your monthly quota or your daily sending limits, on any plan」 — [Pricing](https://developers.cloudflare.com/email-service/platform/pricing/)
- **宛先の制約 (重要)**: かつての Email Routing の送信バインディングは「自アカウントで検証済みの宛先にしか送れない」制約があったが、**現在は解消している**。公式の Limits ページに「**Before you onboard a sending domain, you can send emails only to verified destination addresses in your account.** / **After you onboard a sending domain, you can send to any recipient immediately.**」と明記 — [Limits](https://developers.cloudflare.com/email-service/platform/limits/)
- **上限**: メッセージ 5 MiB / **宛先 50件/通** (to+cc+bcc 合計) / Subject 998文字 / **カスタムヘッダ合計 16 KB**。**日次クォータは非公開**: "New accounts start with a conservative daily quota and scale up over time based on your sending behavior, deliverability rates, and account standing" — [Limits](https://developers.cloudflare.com/email-service/platform/limits/)
- **DNS**: `cf-bounce` サブドメイン上に MX×3 + SPF TXT (`v=spf1 include:_spf.mx.cloudflare.net ~all`) + DKIM TXT (`cf-bounce._domainkey`) + `_dmarc` TXT。**「Cloudflare can configure all required DNS records for you when you onboard a domain」— 自動作成される。** 反映は Cloudflare DNS なら5〜15分 — [Domain configuration](https://developers.cloudflare.com/email-service/configuration/domains/)
- **API**: バインディング `env.EMAIL.send({to, from, subject, html, text, cc, bcc, replyTo, attachments, headers})`。REST API (`POST https://api.cloudflare.com/client/v4/accounts/{account_id}/email/sending/send`) と認証付き SMTP もある — [Send emails](https://developers.cloudflare.com/email-service/get-started/send-emails/)
- **ヘッダ**: 許可リスト方式。`List-Unsubscribe` / `List-Unsubscribe-Post` は明示的に許可され、値も検証される。**`List-Unsubscribe` は "Always DKIM-signed per RFC 8058"**。`Date` / `Message-ID` / `DKIM-Signature` / `Return-Path` 等は `E_HEADER_NOT_ALLOWED` — [Email headers](https://developers.cloudflare.com/email-service/reference/headers/)
- **ログ**: Activity log で個別メールを選び **Preview (HTML / Text / Headers / Attachments / Raw)** を閲覧可能。認証結果 (SPF/DKIM/DMARC)、配送試行とタイムスタンプ、バウンス理由コード、受信サーバの応答も表示。**プレビューは約7日保持**。ログ本体の保持期間は**未文書化** — [Email logs](https://developers.cloudflare.com/email-service/observability/logs/)
- **バウンス/苦情**: 「Cloudflare will automatically add email addresses to your account suppression list for the following reasons: **Hard bounces** … **Spam complaints**」、手動での追加・削除も可能。目標値として配信率>95% / ハードバウンス<2% / 苦情率<0.1% を提示 — [Deliverability](https://developers.cloudflare.com/email-service/concepts/deliverability/)
- **イベント**: **Queues event subscriptions** (2026-07-15〜)。イベント種別は6種: `message.delivered` / `message.deferred` / `message.bounced` / `message.failed` / `message.rejected` / `message.complained` — [Queues event schemas](https://developers.cloudflare.com/queues/event-subscriptions/events-schemas/)。**HTTP webhook ではなく Queue に流れるので署名検証が不要** — Workers から見ると最も安全かつ簡単 (他社は全て HMAC/ECDSA/RSA の検証コードを書く必要がある)
- **利用規約**: Email Service 固有の「トランザクショナル/マーケティング」分類は**見つからなかった [一次情報なし]**

**採用する場合のリスクと対策:**

| リスク | 対策 |
|---|---|
| **public beta (GA 未定、SLA なし)** | 通知ダイジェストは失敗しても写真は失われない。送信を薄いインターフェースに隔離し Resend に差し替え可能にする |
| **日次クォータが非公開・逓増式** | **本番投入前に実測するか Cloudflare サポートに確認する。** 100通/日を安定して通せるかが可否を分ける |
| **ログ本体の保持期間が未文書化** | Queues イベントを D1 に落として自前で保持する (毎時 Cron が既にある) |
| Cloudflare DNS 必須 | furdrop.app は既に Cloudflare DNS。**充足済み** |

---

### Resend (次点 / 退避先)

- **無料枠**: 月3,000通 + **1日100通**、ドメイン3つ、データ保持30日。恒久 (「permanent」という明記は**なし**、$0 プランとして常設) — [Pricing](https://resend.com/pricing)
  - **100通/日は API 上も独立したエラーコード**として存在: `daily_quota_exceeded` (429) と `monthly_quota_exceeded` (429) が別物 — [Errors](https://resend.com/docs/api-reference/errors)。**FurDrop の設計上限とちょうど衝突する**
- **有料**: Pro **$20/月 (50,000通)** / $35 (100,000通)。超過 $0.90/1,000通。専用IP $30/月 — [Pricing](https://resend.com/pricing)
- **DNS**: 3レコード (MX `send` + SPF TXT `send` + DKIM TXT `resend._domainkey`)。**DKIM が CNAME ではなく TXT** で、全てサブドメインなので **CNAME フラット化の問題を踏まない**。Cloudflare では **DNS Only (グレー雲)** にすること、ホスト名は `send` だけ貼ること (ドメイン部を含めない) が公式に明記 — [Cloudflare guide](https://resend.com/docs/dashboard/domains/cloudflare)
  - 補足: Resend の Return-Path は `feedback-smtp.us-east-1.amazonses.com`、SPF は `include:amazonses.com`。**Resend は Amazon SES の上に構築されている**。到達率を評価するうえで知っておくとよい
- **API**: `POST https://api.resend.com/emails`、Bearer 認証、JSON。**バッチは100通/リクエスト** (`/emails/batch`)。`Idempotency-Key` あり。レート制限は**チーム単位で10 req/s**。**Cloudflare Workers 向けの公式ガイドが存在する** — [Send with Cloudflare Workers](https://resend.com/docs/send-with-cloudflare-workers)
- **ログ**: Preview / Plain Text / HTML を閲覧可。**保持30日** — [GDPR](https://resend.com/security/gdpr)。Webhook **18種**
- **バウンス/苦情**: ハードバウンス・苦情で自動抑制リストへ。API で一覧・追加・削除 (一括100件) 可 — [Suppressions](https://resend.com/docs/dashboard/emails/email-suppressions)。Webhook 署名は **Svix** (`svix-id`/`svix-timestamp`/`svix-signature`)。**HMAC-SHA256 の構成詳細は Resend のドキュメントになく svix.com へのリンクのみ [一次情報なし]**
- **利用規約**: AUP は「All mail must be sent to recipients who have explicitly opted in」と厳格。**トランザクショナル/マーケティングの線引きは AUP・ToS・KB のいずれにも見当たらない [一次情報なし]**。設定画面で通知を有効にした登録受信者は AUP の文言上 opt-in に当たると読めるが、Resend の公式見解ではない。**無料枠の商用利用禁止条項はない**

---

### Amazon SES

**単価は圧倒的に最安。しかし運用コストで負ける。**

- **料金改定 (2026-07-21)**: 「Starting July 21, 2026, all new SES accounts begin on the Essentials plan」 — [AWS Blog](https://aws.amazon.com/blogs/messaging-and-targeting/introducing-amazon-simple-email-service-ses-pricing-plans/)。**2026年7月より前の SES 料金情報は古い**
- **無料枠**: 「月3,000通・最初の12ヶ月」は**新規顧客には提供終了**。代わりに AWS 全体の **$200 クレジット** (6ヶ月窓) のみ。**AWS 外 (Workers) から送っても料金は同じ** (旧 EC2/Lambda 条件の 62,000通/月は既に廃止) — [SES Pricing](https://aws.amazon.com/ses/pricing/)
- **価格**: à la carte **$0.10/1,000通**、Essentials $0.16/1,000通。**1,000通で $0.10、10,000通で $1.00**。新規は Essentials に自動配属されるが、**即時に à la carte へ変更できる** — [Pricing plans](https://docs.aws.amazon.com/ses/latest/dg/pricing-plans.html)
- **Sandbox が最大の障壁 (依頼された論点)**:
  - 「You can only send mail **to** verified email addresses and domains」「**200 messages per 24-hour period**」「**1 message per second**」 — [Request production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)
  - **FurDrop の宛先は Firebase Auth 由来の受信者アドレスで、SES に事前検証などできない。production access は最適化ではなく必須の前提ゲート。**
  - 申請はコンソールのモーダル (メール種別・サイトURL・連絡先・言語・同意チェック)。**「AWS Support team provides an initial response to your request within 24 hours」**。却下理由として「use case doesn't align with our policies」「emails appear to be unsolicited」等。**却下時の正式な異議申立て経路は見つからなかった [一次情報なし]**
- **DNS**: DKIM CNAME×3 + custom MAIL FROM の MX×1 + SPF TXT + DMARC TXT = **6レコード**。**MAIL FROM の MX は72時間で検出できないと `Failed` 確定**して再設定が必要 — [MAIL FROM](https://docs.aws.amazon.com/ses/latest/dg/mail-from.html)
  - **Cloudflare での落とし穴が最悪**: ①`dkim.amazonses.com` は Cloudflare が意図的にプロキシ禁止にしている ②**CNAME フラット化が DKIM CNAME を A レコードに潰して壊す**と Cloudflare 公式が明記 — [DNS troubleshooting: email issues](https://developers.cloudflare.com/dns/troubleshooting/email-issues/) / [CNAME flattening](https://developers.cloudflare.com/dns/cname-flattening/)。グローバル/レコード単位の両方で flatten を切る必要がある
- **到達率の閾値が最も明確**: バウンス率 **5%で審査・10%で送信停止**、苦情率 **0.1%で審査・0.5%で停止** — [Enforcement FAQ](https://docs.aws.amazon.com/ses/latest/dg/faqs-enforcement.html)
- **実装**: SigV4 必須、**Bearer 等の代替認証は存在しない**。[aws4fetch](https://github.com/mhart/aws4fetch) (3KB gz、依存ゼロ、Cloudflare が R2 の文脈で[公式に推奨](https://developers.cloudflare.com/r2/examples/aws/aws4fetch/)) を使えば**送信は約25行**。AWS SDK v3 は `@smithy` が `node:fs` を参照するため **Workers での動作保証がなく** 220KB — 使わないこと
  - aws4fetch の最新版は **1.0.20 / 2024-08-28 公開**で約2年更新がない [二次情報]。SigV4 は凍結仕様で依存ゼロなので「完成」と読むのが妥当だが、リスクとして記録しておく
- **ログ**: **送信済みメールの本文は既定では見られない。** VDM の Messages はイベント履歴とメタデータのみ。本文を残すには **Mail Manager email archiving** ($2/GB 取込 + $0.19/GB/月) が別課金 — [VDM dashboard](https://docs.aws.amazon.com/ses/latest/dg/vdm-dashboard.html) / [Email archiving](https://docs.aws.amazon.com/ses/latest/dg/eb-archiving.html)
- **バウンス/苦情**: アカウントレベル抑制リストは 2019-11-25 以降のアカウントで**既定 ON**、**ハードバウンスのみ**追加。加えて**無効化できない global suppression list** が別に存在 (最長14日、照会不可)
  - **SNS → HTTPS の実装コストが重い**: SubscriptionConfirmation フローの分岐、`SignatureVersion` 1 = `SHA1withRSA` が**既定** (2 = SHA256 はオプトイン)、署名対象文字列は `KeyName\nValue\n` をキーのバイト順で連結、`SigningCertURL` のホスト検証は自前 (**正確な正規表現は公式になし**)。Workers の Web Crypto は `RSASSA-PKCS1-v1_5` + SHA-1/SHA-256 に対応するので**検証自体は可能**だが、**X.509 PEM から SPKI を取り出すパーサを自分で書く必要がある (〜100行)**
  - さらに **SubscriptionConfirmation の署名対象フィールドが AWS 公式ページ間で矛盾している** (5項目 vs 7項目)。検証専用ページの方を実装根拠にすること
- **ワンクリック解除**: SESv2 の `Content.Simple.Headers` (**最大15件**) で設定可能。**Raw MIME は不要** — AWS 公式ブログに [まさにこの用途の例](https://aws.amazon.com/blogs/messaging-and-targeting/using-one-click-unsubscribe-with-amazon-ses/) がある
- **利用規約**: AWS AUP のメール条項は「unsolicited mass email」の禁止のみ。**Service Terms §15.6 は「AWS is not the 'sender' as defined in the CAN-SPAM Act or similar applicable law」** — 法令遵守は完全に利用者側の責任。実質的な同意要件は production access 申請時のチェックボックス。**「登録受信者への通知」は transactional として申請すればよく、禁止事由には当たらない**

---

### Postmark (ActiveCampaign)

**ログの質は全社中最良。だが無料枠が小さすぎ、Webhook 署名がない。**

- **無料枠**: **月100通の Developer プラン、恒久**。「no monthly overages allowed」で上限は硬い。**FurDrop の月〜3,000通には桁が足りない** — [Pricing](https://postmarkapp.com/pricing) / [Monthly pricing](https://postmarkapp.com/support/article/1107-how-does-monthly-pricing-work)
  - Sandbox サーバ経由の送信も**月間枠を消費する**
- **有料**: Basic **$15/月 (10,000通)** / Pro $16.50 / Platform $18。**無料100通と10,000通の間に階段がない** — 1,000通/月でも $15 払って 10% しか使わない
- **DNS**: **2レコードだけ** (DKIM TXT + Return-Path CNAME `pm_bounces` → `pm.mtasv.net`)。**SPF は不要**と公式に明言 — [Why we no longer ask for SPF records](https://postmarkapp.com/blog/why-we-no-longer-ask-for-spf-records)。Cloudflare は「オレンジ雲をクリックして無効化」と**公式に明記** — [Return-Path が検証できない](https://postmarkapp.com/support/article/1197-my-return-path-record-wont-verify)
- **到達率**: **Transactional と Broadcast で送信基盤を IP レンジごと完全分離** — 「transactional and broadcast traffic do not mix in Postmark, including IP ranges」 — [Message Streams](https://postmarkapp.com/message-streams)。専用IPは $50/月かつ**月30万通が条件**で、Postmark 自身が「ほとんどの人には無垢な共有IPプールが最良」と非推奨
- **API**: `X-Postmark-Server-Token`、JSON。**バッチ500通/リクエスト**。`ErrorCode 406 = Inactive recipient` (抑制リスト該当) は個別ハンドリングすべき
- **ログ**: **45日間、HTML・プレーンテキスト・生ソース・受信サーバの SMTP 応答まで API で取れる** — [Messages API](https://postmarkapp.com/developer/api/messages-api)。この点は全社中最良
- **バウンス/苦情**: ストリームごとの Suppressions API。**`SpamComplaint` の抑制は削除できない (恒久)**
  - **Webhook 署名なし**: 「**Postmark does not currently support HMAC webhook signature verification**」と公式に明言。代替は URL 埋め込みの Basic 認証 + IP 許可リスト (ただし「The origin IP address can change for each attempt」)。**本調査で見つかった最大の実装上の弱点** — [Webhooks overview](https://postmarkapp.com/developer/webhooks/webhooks-overview)
- **「通知メール」の扱い (依頼された論点) — Postmark が最も明確**:
  - 公式に「Transactional emails are one-to-one unique messages the recipient is expecting to receive」と定義し、**transactional の例として「Weekly digest emails」を明記している** — [What types of messages are a good fit](https://postmarkapp.com/support/article/1082-what-types-of-messages-are-a-good-fit-for-postmark)。さらに「Individual alert emails the user has opted-in to receive」も transactional — [What are transactional emails](https://postmarkapp.com/support/article/804-what-are-transactional-emails)
  - **→ FurDrop のダイジェストは Transactional ストリームで問題ない。** ただし「写真0枚の日は送らない (イベント起動を保つ)」ことが条件。全ユーザーに無条件に定時配信すると「multiple recipients receiving the same content, and it's not triggered by an event」の失格条件に近づく
  - **注意**: ToS のスパム苦情率上限は **0.1% (1/1000)**、バウンス 10%。**Gmail の 0.3% より3倍厳しく**、超過時は「we reserve the right to cancel Your account」 — [Terms of Service](https://postmarkapp.com/terms-of-service)

---

### SendGrid (Twilio) — 除外

**無料枠が廃止されており、この規模では価格が見合わない。**

- **重大な変更**: 「100通/日 永久無料」プランは**廃止された**。Twilio は無料の Email API / Marketing Campaigns プランの提供終了を **2025-05-27 付**で告知し、60日の猶予後 (〜2025年7月下旬) に完全終了 — [Twilio Changelog](https://www.twilio.com/en-us/changelog/sendgrid-free-plan) / [Changes coming to SendGrid's free plans](https://www.twilio.com/en-us/changelog/changes-coming-to-sendgrid-s-free-plans)
- 現在の $0 は **60日トライアル (100通/日)** のみ。期限後は「Any active email send integration using your account's API keys will stop sending messages」 — [Trial Account Plan](https://support.sendgrid.com/hc/en-us/articles/35270136965403-Twilio-SendGrid-Trial-Account-Plan)
- **有料の下限が Essentials $19.95/月 (50,000通)**。1,000通でも10,000通でも同額で、枠の2〜20%しか使わない — [Pricing](https://www.twilio.com/en-us/products/email-api/pricing)
- **ログ保持が3日** (Premier のみ7日)。アドオンで最大30日 [価格は二次情報]
- 技術的には Workers に良く合う (Bearer + JSON、`fetch` のみ、personalizations 1,000件、`List-Unsubscribe` は予約ヘッダに含まれない)。**落ちるのは価格とログ保持**
- Cloudflare DNS の罠: ドメイン認証の CNAME はグレー雲必須だが、**SendGrid の唯一の Cloudflare 公式ドキュメントはリンクブランディング用で「オレンジ雲を有効にせよ」と書いており**、取り違えると検証が通らない [プロキシ問題自体は二次情報]
- Webhook 署名は ECDSA だが **曲線名が公式に明記されておらず** (P-256 と推定)、**DER → raw r‖s 変換**が必要

---

### Brevo (旧 Sendinblue) — 除外

**無料枠の日次300通は要件を満たすが、無料プランには Brevo ロゴが強制表示されるため通知メールには使えない。** さらに解除ヘッダの主導権を Brevo が握る点が、この用途では致命的。

- **前提の訂正**: 「トランザクショナルは別プラン」という想定は**現在は誤り**。Brevo は 2026年時点でトランザクショナルとマーケティングを**同一のプラン階梯・同一の送信枠**で提供している。「All Brevo plans give you access to transactional email features」— [Pricing FAQ](https://www.brevo.com/pricing/)
- **無料枠**: **1日300通** (= 月9,000通相当)、恒久。「The Free plan has no time limit」。超過分は最大1,000通まで再試行キューに入り、それを超えると配信されない — [FAQs: What are the limits of the Free plan](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)
- **ロゴが外せない (決定的)**: 「Emails sent from the Free plan **always** include the Sent with Brevo sticker」「If you have a free plan, the logo will **always** be displayed in your footer」 — [同上](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) / [Will my contacts know that I'm using Brevo](https://help.brevo.com/hc/en-us/articles/209429285-Will-my-contacts-know-that-I-m-using-Brevo)
  - 除去は「Remove Brevo logo」アドオンで **$9/月 (Starter のみ)**、Standard 以上は無料 — [Add-ons](https://help.brevo.com/hc/en-us/articles/4409354969746-Customize-your-plan-with-add-ons)
  - **→ 実質的な下限は Standard $18/月** (Starter $9 + ロゴ除去 $9 = 同額)
- **有料**: Starter $9〜 / Standard $18〜 / Professional $499〜。10,000通/月は Starter の該当ティアで **≈$17/月** [**二次情報** — 料金は認証付き billing API がクライアント側で描画するため、静的な公式ページに「10,000通 = $X」の記述が存在しない]
- **送信前に手動のアカウント承認がある (オンボーディング摩擦)**: 「**Once we approve your account for sending**, you can start sending up to 300 emails per day」 — [Pricing FAQ](https://www.brevo.com/pricing/)。API にも専用エラーコード **`account_under_validation`** ("Account pending verification") が存在する — [How it works](https://developers.brevo.com/docs/how-it-works)。**サインアップして即送信、とはいかない**
- **DNS**: Brevo code TXT + DKIM (TXT×1 または CNAME×2) + DMARC TXT の3〜4件。**SPF と MX は不要**。**Cloudflare 固有の注意を公式に明記**: 「CNAME 型 DKIM を使う場合は Cloudflare の **CNAME フラット化を無効化**すること。有効だと Cloudflare が TXT に変換して DKIM 認証が失敗する」+ 各 DKIM CNAME の Proxy も無効化 — [Authenticate your domain](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC)
- **API**: `POST https://api.brevo.com/v3/smtp/email`、`api-key` ヘッダ、JSON。成功は `201 {"messageId": "..."}`。`messageVersions` で一括 (総宛先2,000 / 版あたり99)。**API レート制限は 1,000 RPS と非常に緩い** (ただしこれは API 呼び出し制限であってプラン送信枠とは別) — [Send a transactional email](https://developers.brevo.com/reference/send-transac-email) / [API limits](https://developers.brevo.com/docs/api-limits)
- **ログ**: 宛先・件名・message ID・タグ等で検索可、CSV 20万件までエクスポート可。**保持は全プラン既定で無期限** (1〜24ヶ月に設定可) — 他社より寛大。**ただし本文プレビューは既定で無効** (「Never store previews」が初期選択) なので、使うなら明示的に有効化が必要 — [Configure a custom retention period](https://help.brevo.com/hc/en-us/articles/4415743225746-Configure-a-custom-retention-period-for-your-transactional-logs-and-email-previews)
- **バウンス/苦情**: トランザクショナル専用のブロックリストがあり (`hardBounce` / `contactFlaggedAsSpam` / `unsubscribedViaEmail` 等)、`GET /v3/smtp/blockedContacts` と `DELETE /v3/smtp/blockedContacts/{email}` で管理できる。**マーケティング側のブロックリストとは自動連動しない**
  - **Webhook に署名がない**。提供されるのは IP 許可リスト / URL 埋め込み Basic 認証 / Bearer トークン / 任意ヘッダのみ — [Secured webhooks](https://developers.brevo.com/docs/secured-webhooks)。**Postmark と同じ弱点**
- **ワンクリック解除 — この用途では逆に問題になる**:
  - Brevo は **トランザクショナルメールにも `List-Unsubscribe` を自動注入する**。「Yes, Brevo automatically includes a list-unsubscribe header in your email campaigns **and transactional emails**」 — [FAQs: About list-unsubscribe](https://help.brevo.com/hc/en-us/articles/19100260472850-FAQs-About-list-unsubscribe-and-list-help-headers-in-emails)。RFC 8058 対応も Brevo 側で完結
  - **一方で自前のヘッダは設定できない**。`headers` フィールドは「Custom email headers (**non-standard** headers)… **Standard email headers are not supported**」と明記されており、`List-Unsubscribe` は標準ヘッダ — [Send a transactional email](https://developers.brevo.com/reference/send-transac-email)
  - **結果として起きること**: 受信者がメールクライアントの解除ボタンを押すと、FurDrop が関知しないまま Brevo のトランザクショナルブロックリストに載り、**以後その受信者への通知が Brevo 側で黙って落とされる**。FurDrop 側の DB は「通知ON」のままなので不整合になる。`GET /v3/smtp/blockedContacts` と突き合わせる実装が必須になる
  - 解除ヘッダのオプトアウトは **Enterprise プランのみ**、サポート申請制
- **利用規約**: トランザクショナルの定義は「strictly informational and should not include any marketing content」かつ「**triggered by a user's action on your website**」— [marketing/transactional/automation の違い](https://help.brevo.com/hc/en-us/articles/360021196220-What-are-the-differences-between-marketing-transactional-and-automation-emails)。**FurDrop のダイジェストは「第三者のアップロード」が起点で、受信者自身の操作ではないため、この定義に完全には収まらない**。Brevo が digest を明示的に分類した記述は**見つからなかった [一次情報なし]**

---

### Mailgun — 除外

- **無料プランは恒久で存在するが 100通/日** (月間表記なし)。**ログ保持が Free/Basic で1日**、Foundation 5日、Scale 30日 — [Pricing](https://www.mailgun.com/pricing/)
- **クレジットカード登録前は「authorized recipients」最大5アドレスにしか送れない** [公式だが検索スニペット経由 — help.mailgun.com は直接取得が403]
- 有料は Basic $15/月 (10,000通)。**$15 払っても1日ログのまま**なのが致命的
- API は **multipart/form-data** (JSON ではない) で Basic 認証。Workers では `FormData` + `btoa()` で対応可 (Content-Type は自分で設定しない)
- Webhook 署名は **HMAC-SHA256(timestamp+token) の hexdigest、ヘッダではなく JSON ボディ内** — 実装は最も素直 — [Securing webhooks](https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/securing-webhooks)
- **AUP はトランザクショナルを明示的に除外**: 「transactional and confirmation emails and SMS do not require an unsubscribe link」「Emails and SMS (**unless transactional**) can only be sent where permission has been expressly obtained」 — [AUP](https://www.mailgun.com/legal/aup/)

### その他検討した候補

| サービス | 無料枠 | 判定 |
|---|---|---|
| **Mailjet** | **月6,000通 / 日200通**、恒久 | **無料枠は最も寛大だが、無料プランは Mailjet ロゴが強制表示** (「No Mailjet logo」が Essential 以上の機能)。プロダクト通知には不適。ロゴを外すと Starter $9/月 (8,000通) — [Pricing](https://www.mailjet.com/pricing/) |
| **AhaSend** | 月1,000通、ドメイン3つ | 枠が小さく、ベンダーとしての実績が最も浅い — [Pricing](https://ahasend.com/pricing) |
| **MailerSend** | 月500通 | 枠が小さすぎ、API リクエストも1日100回上限 — [Pricing](https://www.mailersend.com/pricing) |
| **Zoho ZeptoMail** | 恒久無料枠なし (初回10,000通を1ヶ月) | 従量クレジット制 — [Pricing](https://www.zoho.com/zeptomail/pricing.html) |
| **Loops** | 月4,000通だが**トランザクショナルは有料プラン限定** | 用途が合わない — [Pricing](https://loops.so/pricing) |
| **Plunk** | 月1,000通。**AGPL-3.0 で自己ホスト可** | 自前運用したい場合のみ — [Pricing](https://www.useplunk.com/pricing) |
| **Scaleway TEM** | 月300通 | 枠が小さく、EU リージョン — [Pricing](https://www.scaleway.com/en/pricing/managed-services/) |

---

## 実装時の注意 (FurDrop 固有)

### 日本法まわり

- **特定電子メール法のオプトイン規制は「広告・宣伝目的」のメールが対象**。総務省の解説によれば、規制対象は「利用者の同意を得ずに広告、宣伝又は勧誘等を目的とした電子メール」であり、第三条第3項ただし書により「電子メールの受信をする者の意思に基づき広告又は宣伝以外の行為を主たる目的として送信される電子メールにおいて広告又は宣伝が付随的に行われる場合」は規制対象外 — [総務省: 特定電子メールの送信の適正化等に関する法律](https://www.soumu.go.jp/main_sosiki/cybersecurity/kokumin/basic/legal/08/)
  - **→ 「写真をN枚受け取りました」の通知は広告・宣伝ではないので、同法のオプトイン規制の対象外と整理できる。** ただし本文に販促要素 (有料プラン訴求など) を混ぜると性格が変わるので、**通知メールに宣伝を入れないこと**。
  - より詳細な該当例は総務省・消費者庁の[特定電子メールの送信等に関するガイドライン (PDF)](https://www.soumu.go.jp/main_content/000060967.pdf) を参照 (本調査では PDF のテキスト抽出ができず、原文引用は未確認)
- **プライバシーポリシーの更新が必要。** `docs/legal-risk-report.md` の整理に従い、受信者のメールアドレスを国外のメール送信事業者に渡す以上、**第三者提供 (または委託) と越境移転の記載**を追加する必要がある。既に Firebase Auth / FCM を列挙している「外部送信先一覧」に、選定したサービスを1行追加するかたち。
  - **Cloudflare を選ぶ場合、この追記コストが最小になる** — Cloudflare は Workers / Pages / D1 / R2 で既に委託先として記載されているはずで、新規の事業者が増えない。

### 実装上の共通事項

- **送信は薄いインターフェースに隔離する** (`sendEmail(to, subject, html, text, headers)` 相当)。推奨の Cloudflare Email Service が beta である以上、差し替え可能性は設計要件。
- **既存の毎時 Cron (`crons = ["0 * * * *"]`) に相乗りできる。** ダイジェストは1日1回なので、時刻判定を入れるだけでよい。
- **`users.email` は既にある** (Firebase Auth 由来) が、**通知の ON/OFF 設定と解除トークンは新規に必要**。RFC 8058 の解除エンドポイントは「HTTPS POST を受けて 200/202 を返す」だけでよい。
- **配信は宛先ごとに1通**にする (ダイジェストの中身が受信者ごとに異なるため)。Cloudflare は1通あたり宛先50件までだが、そもそも BCC でまとめてはいけない。
- **写真0枚の日は送らない。** Postmark の定義に照らしても、Gmail のスパム率の観点でも、イベント起動を保つことが重要。
- **実装後、実際に受信したメールの `DKIM-Signature` の `h=` に `list-unsubscribe` と `list-unsubscribe-post` が含まれているかを目視確認する** (§RFC 8058 参照)。

---

## 脚注

### MailChannels の Cloudflare Workers 無料枠終了について

依頼のとおり候補外だが、終了の事実を一次情報で確認した。

- MailChannels 自身のブログ告知: **「Important Update: MailChannels' Email Sending API for Cloudflare Workers to be Terminated」**。**終了日は 2024年6月30日** と明記されている。理由の明示はなく、「a new email sending service that will better serve developers' needs」への移行を示唆する内容 — [MailChannels Blog](https://blog.mailchannels.com/important-update-mailchannels-email-sending-api-for-cloudflare-workers-to-be-terminated/)
- MailChannels のサポートセンターにも End of Life Notice のページが存在するが、**直接取得は HTTP 403 で読めなかった** — https://support.mailchannels.com/hc/en-us/articles/26814255454093-End-of-Life-Notice-Cloudflare-Workers 。「部分的な失敗は2024年6月1日開始、完全停止は2024年6月30日 17:00 PDT」という詳細は**二次情報 (検索スニペット経由)** のため参考扱い
- なお現在の MailChannels は通常のメール送信サービスとして **月3,000通・日100通の無料プラン**を提供している — [Pricing](https://www.mailchannels.com/pricing/)。ただし今回は候補外の指示に従い比較表には含めていない

### この調査で確認できなかったこと

- **Cloudflare Email Service の日次クォータの具体値** — 「conservative」「scale up over time」としか書かれておらず、数値がどこにもない。**採用するなら実測かサポート確認が必須**
- **Cloudflare Email Service のログ本体 (プレビュー以外) の保持期間** — 未文書化
- **Resend の Svix 署名の構成詳細** — Resend 側にはヘッダ名しかなく svix.com へのリンクのみ
- **Resend / SendGrid / Cloudflare の AUP における「トランザクショナル vs マーケティング」の明示的な分類** — いずれも定義がない。明確なのは **Postmark (digest を transactional と明記)** と **Mailgun (AUP で transactional を除外)** のみ
- **各社が `List-Unsubscribe` を DKIM の `h=` に含めるか** — 明記しているのは Cloudflare のみ。他社は実測が必要
- **Brevo の送信ティアごとの正確な月額** — 料金ページが認証付きの billing API (`billing-v2.brevo.com`) からクライアント側で描画するため、静的な公式ページに数値がない。表の「≈$17」は Brevo 自身の比較ページからの導出 [二次情報]
- **無料枠での送信ドメイン数の上限** (依頼された論点) — **明記があったのは Resend (3) と Mailgun (1) のみ**。Cloudflare / Postmark / SendGrid / Brevo は上限の記載が見当たらなかった (「上限なし」とも書かれていない)
- **特定電子メール法ガイドライン (PDF) の原文引用** — PDF のテキスト抽出手段がなく、総務省の HTML 解説ページで代替した

### 一次情報に当たれなかったページ (403 等)

- `support.mailchannels.com` の End of Life Notice (403) → MailChannels 自身のブログで代替
- `help.mailgun.com` (403) → 検索スニペット経由の公式内容として [二次情報] 扱いで記載
- `help.brevo.com` の HTML (403) → 調査担当が公開 Zendesk JSON API (`/api/v2/help_center/en-us/articles/<id>.json`) 経由で本文を取得。引用は canonical な `help.brevo.com` URL を表記している
