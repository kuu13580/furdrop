# 一括ダウンロードのサーバー ZIP 化 — 検討メモ (進行中)

R17 (DL 時の EXIF 埋め込み) の実装中に見つかったメモリ問題を起点に、一括 DL を
「クライアントで ZIP」から「Workers でストリーミング ZIP」へ移す検討の記録。

**まだ実装していない。** 決定済みの部分と未決定の部分を分けて書く。
R17 自体の確定仕様は `docs/archive/exif-on-download-decisions.md` にある (こちらは決定済み)。

---

## 1. 現状

| | |
|---|---|
| ブランチ | `feature/exif-on-download` (`origin/main` の直上 1 コミット) |
| PR | #99 (**Draft**) — https://github.com/kuu13580/furdrop/pull/99 |
| 中身 | R17 のクライアントサイド実装。3 層テスト・静的チェックはすべて green |

**PR #99 の一括 DL 実装 (`frontend/src/lib/zip-download.ts` のクライアント ZIP) は、
この検討の結果として同じ PR 内で捨てる方針。** そのため「クライアント版のメモリ最適化
(`Blob.slice` によるコピー排除)」は着手しない — 同じ PR で消えるので無駄になる。

R17 の仕様変更 (送信者オプションの撤去 / 受信者の選択 UI / 法務 / docs) はサーバー版でも
そのまま使えるので、PR の価値は失われない。

---

## 2. なぜサーバー ZIP へ移すのか

### 問題の本質

単体 DL は presigned URL への直リンクなので、**ブラウザのダウンロードマネージャが
ディスクへ逐次書き**する。だからメモリ問題が起きない。一方クライアント ZIP は
メモリ上の Blob に全量を組み立ててから `a[download]` に渡すので、枚数に比例して溜まる。
**iOS の WebKit は Blob をディスクに退避できない**ため、ここが天井になる。

サーバー ZIP の価値は「加工をサーバーでやること」ではなく、
**一括 DL を単体 DL と同じ 1 本の HTTP レスポンスにして、ブラウザに書かせること**。

### Fable のメモリレビュー結果 (2026-08 時点、実コードを読んで確認済み)

深刻度順:

1. **[High / 元からあった問題]** `BlobWriter` が ZIP 全体をメモリに累積する。
   zip.js `io.js:232` が `new Response(transformStream.readable).blob()`。
   選択枚数に上限がなく (`GET /receiver/photo-ids` が送信者の全件を返す)、
   15MB/枚なら iOS で **推定 40〜70 枚**でタブが jetsam で殺される。
   **壊れ方は無言** (例外なし・モーダルごと消えてリロード)。
2. **[High / R17 が持ち込んだ悪化]** `exif-credit.ts` が 1 枚あたり 3 コピーの
   フルサイズ JS ヒープ確保を追加した (`:47` arrayBuffer / `:65` out / `:69` new Blob)。
   並列 4 と掛けて +180〜240MB。JS ヒープはディスクに退避されない。
3. **[Medium / 元からあった問題]** **zip.js は並列 `add()` を直列化しない。**
   `zip-writer.js:713-721` で `writerLocked || bufferedWrites` のとき
   `new TransformStream(..., { highWaterMark: INFINITY_VALUE })` を作り、
   **エントリ丸ごとバッファする** (バックプレッシャ無効)。
   `zip-download.ts:31` のコメント「ZipWriter は内部で add を直列化する」は**実装と逆**。
4. **[Low]** piexif の load→dump 再直列化で MakerNote / MPF (iPhone の HDR ゲインマップ等) の
   絶対オフセットが壊れる可能性。**未検証**だが piexifjs の既知の限界としては筋が通る。
   → 修正困難なので requirements.md の R17 に既知の制限として一行残すのが現実解。
5. **[Info]** `exif-credit.ts` の `scanSegments` が 0xFF フィルバイトを扱っていない (実害は小)。

枚数の見積もりは iOS のメモリ予算を仮定した**推定値**であり実測ではない。

---

## 3. 検証済みの事実 (再調査しないこと)

### CRC32 の実測 (zip.js の実装、Node 24 / V8)

`lib/core/streams/codecs/crc32.js` はバイト単位のテーブル参照。実測:

```
563 MiB/s  →  1.78 CPU-ms / MiB  →  1.82 CPU-s / GiB
```

### Cloudflare の料金・制限 (公式ドキュメントで確認)

- Workers Paid: **$5/月**、リクエスト **10M 込み / 超過 $0.30 per 1M**、
  CPU **30M CPU-ms 込み / 超過 $0.02 per 1M CPU-ms**、
  **egress と帯域は課金なし** ("There are no additional charges for data transfer (egress) or throughput")
- **ネットワーク待ちは CPU 時間に含まれない** ("Waiting on network requests ... does not count toward CPU time")
- **HTTP Worker に duration の上限なし** ("As long as the client remains connected, the Worker can
  continue processing, making subrequests, and streaming a response body")
- **レスポンスボディのサイズ制限なし** ("Cloudflare does not enforce response body size limits")
- CPU 上限: 既定 30s、`[limits] cpu_ms` で**最大 300,000 (5 分)**
- メモリ: **128 MB / isolate**
- Subrequests: Paid **10,000/request** (最大 10M まで設定可)
- R2 `GetObject` は **Class B ($0.36/M、月 10M 無料)**、R2 egress は無料

出典:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/workers/wrangler/configuration/

### コスト試算 → 実質ゼロ

| | 実測レート | 保守的に 4 倍 |
|---|---|---|
| 込み枠だけで捌ける転送量 | 約 16 TB/月 | 約 4 TB/月 |
| 超過分の単価 | $0.04 / TB | $0.15 / TB |
| R2 Class B (15MB/枚) | $0.025 / TB (無料枠内なら $0) | 同じ |

**費用は論点にならない。** 効いてくるのは 1 リクエストの CPU 上限:

| CPU 上限 | 作れる ZIP (実測) | (保守的 4 倍) |
|---|---|---|
| 30s (既定) | 約 16 GiB | 約 4 GiB |
| 300s (最大) | 約 164 GiB | 約 41 GiB |

受信者クォータは 10GB なので全件 ZIP でも収まる計算。

### Content-Length は推定で返せない

- HTTP 上、正確でなければならない (不一致は truncate かエラー)
- **Workers は通常の `ReadableStream` に手で設定した Content-Length を無視して chunked にする。**
  実際に載せるには **`FixedLengthStream`** が必要で、これは**宣言と違うバイト数を書くとエラー**
  → 推定値を入れると「進捗がズレる」ではなく「ダウンロードが壊れる」

出典: https://developers.cloudflare.com/workers/runtime-apis/streams/transformstream/

### zip.js は Workers で動く見込み

- **`@zip.js/zip.js/lib/zip-core-writer.js`** という writer 専用エクスポートがある
  (`ZipWriter` / `ZipWriterStream` だけ。reader も codec worker も入らない)
- `core/configuration.js` の `navigator` 参照は `typeof navigator != "undefined"` でガード済み
- store (`level: 0`) なら deflate も Web Worker も不要
- `ZipWriterStream` があるので `TransformStream` の readable をそのまま Response body に流せる
- **実装で必ず守る点**: `add` は**逐次**にする。並列にすると上記 3 の `bufferedWrite` 経路に入り、
  128MB の isolate では即死する。逐次なら writable に直書きしてバックプレッシャが効く

### EXIF 処理の移植性

`frontend/src/lib/exif-credit.ts` の「APP1 だけ差し替える」ロジックは**ほぼそのまま Worker に
移植できる**。R2 の body stream の先頭だけバッファして APP1 を差し替え、残りはパススルー。
piexifjs は純 JS で `atob`/`btoa` しか使わないので Workers で動く。

---

## 4. 決定したこと

1. **一括 DL は Workers でストリーミング ZIP にする** (方針として合意)
2. **PR #99 の中でサーバー版に一貫させる** (別 PR に分けない)
3. **進捗表示 (Content-Length) は MUST 要件ではない** → chunked で可。
   これにより**事前サイズ計算パスと `FixedLengthStream` は不要**になり設計が大幅に軽くなる
4. **クライアント版のメモリ最適化はやらない** (同じ PR で捨てるため)
5. `.claude/rules/workers.md` の「Workers を通してストリームしない (CPU制限のため)」は
   **削除ではなく精緻化**する。画像のデコード/リサイズは Workers でやらない、
   バイトの通過は可 — という趣旨に直す。architecture.md / requirements.md (R08/R17) /
   screen-flow.md (S07) も追従が必要
6. **認証方式は C (隠し form POST) を軸に検討する** (下記)

---

## 5. 認証方式の選択肢

ブラウザのダウンロードは `Authorization` ヘッダを送れないため、別の手段が必要。
**API は別オリジン** (`VITE_API_BASE_URL` が絶対 URL、`architecture.md` も `api.` の別ホスト)
なので **Cookie は third-party cookie になり Safari の ITP に潰される → 不可**。

| | 仕組み | 任意選択 | サーバー状態 | リスク |
|---|---|---|---|---|
| A. D1 チケット | 認証 POST → ランダム 128bit のチケットを D1 に保存 → `GET /receiver/zip/:ticket` | ○ | D1 に 1 行 (既存の毎時 Cron で掃除) | URL が履歴・ログに残る (短 TTL + uid 紐付けで緩和) |
| B. 署名トークン + フィルタ指定 | HMAC 署名した `{uid, filter, exifMode, exp}` を URL に。選択は条件で表現 | × | なし | ギャラリーの個別選択 UX を捨てる |
| **C. 隠し form POST** | `<form method="post">` でトークンと ID リストを**ボディ**に入れて送信、`Content-Disposition` で DL | ○ | なし | **モバイル Safari の挙動が要検証** |

**KV は使えない** — 結果整合性のため、60 秒 TTL のチケットが別コロから読めない可能性がある。

**現在の方針は C。** 状態を持たずに任意選択を維持できる唯一の案。
ID リストは URL に載らない (UUID 500 個で約 18KB) ので、ボディに入れられる C の利点は大きい。

### C の既知リスク

1. **ユーザージェスチャの連鎖が切れる問題**: `target="_blank"` の form 送信はクリックハンドラから
   同期的に呼ばないとポップアップブロックされ得る。`getIdToken()` は Promise なので
   `await` を挟むとブロックされる可能性。
   → 緩和: **選択モードに入った時点でトークンを取っておき**、クリックハンドラは同期 submit。
     ID トークンは 1 時間有効なので実用上問題ない。あるいは `target` を隠し iframe にする
     (iframe 宛はポップアップブロック対象外だが iOS の挙動が怪しい)
2. **Safari は長い `Content-Disposition` を truncate する** (ファイル名が壊れる)。
   現状の `buildZipName` は `furdrop-<handle>-<14桁>.zip` で handle 上限 32 文字でも
   **59 文字**なので問題ない範囲

Web 上の情報は古いフォーラム投稿が中心で質が低い (iOS 13 以前の「ダウンロードフォルダがない」
という記述が今も上位に残る)。**実機確認で判断すべき。**

---

## 6. 次のアクション: spike (使い捨ての挙動確認)

`/dev/images/*` という dev 限定ルートの前例に倣って、dev 限定で最小の検証コードを置く。
**製品コードには触らない。認証も UI も絡めない。**

実機検証の下地は既にある: `scripts/wsl-port-forwarding.ps1` が 4000/9000 を LAN に開け、
`frontend/src/lib/api.ts` が `localhost` をアクセス元ホスト名に書き換えるので、
**iPhone から LAN 経由で dev サーバーを触るのは想定済みの動線**。

### spike で答えを出す問い

1. **zip.js は workerd で動くか** (`lib/zip-core-writer.js` を import して `ZipWriter` が動くか)
2. **逐次 `add` でメモリが有界に保たれるか** (並列 `add` の `bufferedWrite` 経路を踏まないこと。
   クライアントの受信速度でバックプレッシャがかかること)
3. **iOS Safari が大きな chunked attachment をディスクに流せるか** ← **本命**。1〜2GB 程度で確認。
   ここが NG ならサーバー ZIP 自体を再考することになる
   (「サーバー ZIP なら iOS で解決」という前提そのものが未検証)
4. **form POST 起点のダウンロードが実際に発火するか** — desktop Chrome / desktop Safari /
   iOS Safari。`target="_blank"` と隠し iframe の両方
5. **ジェスチャ連鎖の問題が実際に出るか** — クリック直後の同期 submit と `await` を挟んだ場合の差

判断の分岐: 3 が NG → サーバー ZIP を再考 / 4,5 が NG → C を A (D1 チケット) に切り替え

---

## 7. 未決定事項

- 認証方式の最終決定 (C で行けるか、A に落とすか) — spike 待ち
- ヘッダ送出後に R2 の get が失敗したときの扱い。**切れた ZIP は防げない**
  (200 と `Content-Disposition` を返した後はエラーに切り替えられない)。
  → 案: 失敗した 1 枚はスキップして `MISSING.txt` を同梱し、中断しない
- 単体 DL もサーバーに寄せて `exif-credit.ts` を消すか、クライアントに残すか。
  寄せると EXIF を書く場所が 1 箇所に集約される。「記録しない」は直リンク維持
- 再開不可 (Range 未対応) を許容するか。10GB を細い回線で落として切れたらゼロから
- `[limits] cpu_ms` をどこまで上げるか
- クライアント側で消えるもの: `zip-download.ts` / `BatchDownloadModal` /
  一括 DL の `beforeunload` 抑止 / 並列度チューニング

---

## 8. 作業上の注意

- **commit / push はユーザーの明示指示を待つ** (この worktree の運用ルール)
- マイグレーションを改番するとローカル test D1 が未適用扱いで再実行して失敗する。
  記録テーブルの名前を付け替えれば直る:
  ```
  pnpm exec wrangler d1 execute furdrop-test --local --config wrangler.test.toml \
    --command "UPDATE d1_migrations SET name = '0010_drop_exif_embed.sql' WHERE name = '0009_drop_exif_embed.sql'"
  ```
- `pnpm fix` は `frontend/index.html` / `frontend/en/index.html` /
  `marketing/release-trailer/index.html` を無関係に整形するので、コミット前に `git restore` する
- 文言を変えたら `pnpm i18n:extract` + en 訳文まで埋める (`pnpm i18n:check` で 0 になること)
- 図版を変えたら `pnpm shots` で撮り直して**目視確認**

---

## 9. spike の実測結果 (2026-08-24)

検証コードの置き場所:

| ファイル | 位置づけ |
|---|---|
| `workers/src/lib/zip-stream.ts` | 実装本線。`createZipStream` (逐次 add) + `applyExifCredit` |
| `workers/src/lib/exif-credit.ts` | frontend 版を Workers へ移植。先頭バッファに対する純関数 |
| `workers/test/zip-stream.test.ts` | workerd 上で 9 本。ZIP は自前でセントラルディレクトリを辿り CRC32 も自前計算 |
| `workers/src/spike/zip-spike.ts` + `workers/wrangler.spike.toml` | **使い捨て**。検証後に消す |

### Q1 zip.js は workerd で動く — Yes

`@zip.js/zip.js/lib/zip-core-native.js` の `ZipWriter` が動き、`unzip -t` の通る ZIP を吐く。
CRC32 も独立実装で照合して一致。

### Q7 サイズ未知の `add` は 1000 バイトでも ZIP64 になる — 確認

`add` に size を渡さないとローカルヘッダの version-needed が **45** + extra field `0x0001`。
渡すと **20**。**R2 の `object.size` は必ず渡す。** `applyExifCredit` は APP1 差し替え後の
サイズを返すので、EXIF を書いても正確な size を宣言できる (テストで宣言値と実バイト数の一致を検証)。

`unzip` は ZIP64 + data descriptor 版も開けた。**macOS Archive Utility は手元に Mac が無く未検証。**

### 「並列 add は 128MB isolate で即死」は workerd では起きない — 別のもっと悪いことが起きる

`/info` の実測: workerd では **`navigator.hardwareConcurrency === 1`**、`typeof Worker === "undefined"`。

`lib/core/configuration.js` は `maxWorkers` を `navigator.hardwareConcurrency` から取るので
**既定 maxWorkers = 1**。そして `lib/core/zip-writer.js:186` の `let workers = 0` /
`const pendingEntries = []` は **module スコープ = isolate 全体で共有**。
`add()` はこのカウンタでゲートする。

→ **同じ isolate で 2 本目の ZIP リクエストが永久に待たされ、workerd が
「ハングした」と判定してリクエストを kill する。クライアントには無言で空の 200 が返る。**

```
A: --limit-rate 1M で 50MB を落とし始める
B: 2 秒後に投げる → http=200 bytes=0 / 2ms で完了
   wrangler ログ: Uncaught Error: The Workers runtime canceled this request because
                  it detected that your Worker's code had hung...
```

**対処**: `zip-stream.ts` のモジュール初期化で
`configure({ maxWorkers: Number.MAX_SAFE_INTEGER, useWebWorkers: false })` を呼ぶ。
`configure` は `lib/zip-core-writer.js` から export されていないので import を
`lib/zip-core-native.js` に変えた (wasm を引かない)。再実測で B は `bytes=2097566` /
`unzip -t` OK。1 リクエスト内は逐次 add なのでメモリ上界は「1 エントリ分」で変わらない。

### 並列 add の壊れ方は「メモリ爆発」ではなく **エントリの無言欠落**

`void add(entry)` を 5 回撃つと ZIP に **1 エントリしか入らない** (逐次なら 5)。
`unzip -t` は通るので気づけない。**add は必ず await する。**

### Q2 逐次 add でメモリは有界 — ローカルでは Yes

`curl -N --limit-rate 20M` の遅い読み手を繋いで workerd の RSS をサンプリング:

| 転送量 | peak RSS |
|---|---|
| idle | 168 MB |
| 1 GB (100×10MB) | 280 MB → maxWorkers 解除後は 170 MB |
| 3 GB (300×10MB) | 290 MB |

**総バイト数を 3 倍にしても peak が変わらない = 有界。**
ただしローカル workerd の RSS は inspector 等も含む値で、**実際の 128MB isolate 制限は未検証**。
`wrangler dev --remote` は **Cloudflare に未ログインで実行できなかった** (`wrangler login` 待ち)。

### その他の実測

- `Transfer-Encoding: chunked` / `Content-Disposition: attachment`。`Content-Length` は付かない
- `failAt=3` (ヘッダ送出後に throw) → `http=200` で途中まで届き `unzip -t` は失敗 = 想定通り「壊れた ZIP」
- `gapMs=200` × 20 エントリでも問題なし (エッジのアイドル切断は未検証)
- 先頭バッファに SOS が入らない JPEG (APP2 で 256KB 超に押し出したもの) は差し替えを諦めて無加工で流す
- `wrangler dev --remote` は `.dev.vars` の値を読み込む (ログに "Using secrets defined in .dev.vars")

### 未検証のまま残っているもの

- **Q3** iOS/iPadOS Safari が数 GB の attachment をディスクへ流せるか ← 本命。実機待ち
- **Q4 / Q5** form POST 起点の DL とジェスチャ連鎖 ← 実機待ち
- **Q6** subrequest 上限 (ローカル workerd は強制しない) ← `--remote` 待ち
- 128MB isolate の実際の挙動 ← `--remote` 待ち
- macOS Archive Utility での展開 (Mac が無い)
- 本番の HTTPS + HTTP/2/3 での挙動 (LAN の平文 HTTP/1.1 しか試せていない)
- iPad で通っても iPhone で通る保証はない (RAM が多く Safari も desktop-class)

### 実機検証の動線

spike はポート **9000** で LAN に開いている (`scripts/wsl-port-forwarding.ps1` が既に 9000 を
転送しているため。ただし通常の `pnpm --filter workers dev` と衝突する)。

```
pnpm exec wrangler dev --config wrangler.spike.toml --ip 0.0.0.0 --port 9000
→ 端末から http://<WSL ホストの LAN IP>:9000/page
```

---

## 10. Fable の 2 回目のレビューを受けた修正 (2026-08-24)

### 要修正だった 1 件: 壊れた EXIF のフォールバックがリグレッションだった

移植時に `piexif.load` の throw を catch して**空の dict で続行**していた。これは既存 APP1 を
Artist だけの新セグメントで丸ごと置き換えるので、**piexif が読めないが他のリーダーは読める EXIF**
(MakerNote が濃いファイル等) で Orientation・撮影日時・カメラ情報が無言で消える。
frontend 版は throw を上に投げて「無加工で DL 成立」に落ちていた。R17 の方針もそちら。
→ **catch で `return null` (無加工パススルー) に修正。**

### 「並列 add は無言にエントリが消える」の真因はランタイム依存だった

Fable が Node と workerd で再現実験して特定:

- **Node (V8) では `void add` × 5 で 5 エントリ全部入る。** zip.js 固有の挙動ではない
- **workerd は `highWaterMark: Infinity` の TransformStream に TypeError を投げる**
  (`The value cannot be converted because it is not an integer`)

つまり真因は「workerd が Infinity を拒否 → その reject が zip.js の `void add` と
`close()` の `Promise.allSettled` に二重に飲まれる」。**ランタイムのバージョンが変われば
失敗モードごと変わる** (将来 workerd が仕様どおり Infinity を受けると、元の恐怖である
「エントリ丸ごとメモリバッファ」に戻る)。

→ **規約 (「add は必ず await」) ではなく構造で守る。** `createZipStream` の `add` を
promise チェーンに繋いで内部で直列化した。実測での before/after:

| | `parallel=1` (add を await しない) の結果 |
|---|---|
| 直列化前 | 5 投げて **1 エントリ** (`unzip -t` は通るので気づけない) |
| 直列化後 | 5 投げて **5 エントリ** |

**`add` に `dataDescriptor: false` を渡してはいけない**という地雷も併せてコメントで残した
(`!dataDescriptor` も bufferedWrite の条件に入っているため、全 add が同じ経路に落ちる)。

### `maxWorkers = MAX_SAFE_INTEGER` は妥当 (ソースで確認済み)

- `codec-pool.js` も同型のゲート (`pool.length < maxWorkers` + module スコープの
  `pendingRequests`) を持つが、同じ `configure` で到達不能になる
- `terminateWorkerTimeout` の setTimeout は踏まない (`useWebWorkers: false` のインライン codec は
  `onTaskFinished` で pool から即除去され、module スコープにタイマーも codec も残らない)
- **有限値に下げてはいけない。** `workers` カウンタと pool の busy エントリは、リクエストが
  途中キャンセルされて promise が永久未解決になると finally が走らず**上方向にドリフトする**。
  「1 リクエスト 1 add だから 4 で十分」のような有限値はいずれ再デッドロックする

### 「宣言サイズがずれる」の blast radius は思っていたより小さい

Fable の実測 (Node): 宣言 9999 / 実 4000 バイトでも **zip.js は throw せず、data descriptor と
セントラルディレクトリには実測値を書き、`unzip -t` が通る有効な ZIP になる**。
宣言値が効くのは ZIP64 判定だけ。つまりサイズ計算にバグがあっても「壊れた ZIP」ではなく
「有効な ZIP」に縮退する (例外: 宣言 <4GB / 実 ≥4GB の境界。20MB/枚では起き得ない)。
テストの厳密一致は不変条件として維持する。

### EXIF 差し替えの条件を緩めた

「SOS まで届いていないと触らない」を「**既存 APP1 が head 内で見つかっていれば SOS 未到達でも
置換する**」に緩和。置換範囲より後ろは無変更でパススルーされるので安全で、ICC が EXIF の後ろに
256KB 超積まれた写真で不必要にクレジットをスキップしなくなる。SOS 到達を要求するのは
「EXIF が無いので挿入位置を決めなければならない」ケースだけ。

### エントリ途中の R2 失敗: 挙動は正しいが Workers Logs にノイズが出る

spike の `failMid=3` で実測: 8.4MB まで届いてストリームが切れ、
**`unzip` はセントラルディレクトリを見つけられない = 壊れた ZIP** (クライアントは失敗に気づける)。
`onError` も発火する。**ただし zip.js の内部 pipeThrough 段がソースのエラーを拾い切らず、
同じエラーが Worker のログに複数回 "Uncaught Error" として出る** (vitest では 9 件の
unhandled rejection として現れた)。実害は観測ノイズのみだが、本番の Workers Logs でも出る。

このため「エントリ途中失敗」の自動テストは**自前レイヤ (`applyExifCredit`) に置いた**
(パススルー中の body 断で出力ストリームがエラーになること / 出力の cancel が元の body に
伝播すること)。ZIP 層まで通す end-to-end は unhandled rejection でスイート全体を
落とすので spike の手動確認に委ねる。

### テストは 16 本に

追加したもの: **同一 isolate で 2 本同時に流して両方完走する回帰テスト** (maxWorkers 対策が
生きていることの番犬)、本番形状 (head=256KB より大きい JPEG) での末尾パススルー +
**TIFF ヘッダから IFD0 を自前で辿る独立検証**、壊れた EXIF の無加工フォールバック、
日本語の送信者名、EXIF が head 内 / head 外での差し替え可否、ストリーム断と cancel 伝播。

`pnpm test:workers` は 75 passed / 2 skipped。

### あえてやらないと決めたこと

- **65535 エントリ超の ZIP64 セントラルディレクトリのテスト** (計画 I.4)。subrequest 上限が
  1 リクエストあたり 1,000 前後なので、この規模には**構造的に到達できない**。
  枚数上限を設ける方針 (Q6) とも整合する。テスト時間に見合わないので落とす
- 実カメラ JPEG + exiftool での before/after 比較。**この環境に exiftool が無く、サンプル写真も無い**。
  MakerNote / MPF の絶対オフセット破壊リスク (§2 の 4) は**未検証のまま**。
  実装 PR で requirements.md の R17 に既知の制限として一行残す

### まだ残っている未検証事項 (Fable 指摘ぶんを含む)

- ローカルの workerd は `compatibility_date = 2026-04-01` を受けられず **2025-12-10 に
  fallback して動いている**。緑のテストも実測もすべてこのランタイム上の結果で、
  本番ランタイムの挙動 (特に Infinity hwm の TypeError の有無) とは版がずれうる
- workerd の HTTP 切断が entry body の cancel まで伝播するか (spike は entry 間の
  `request.signal` チェックのみ確認済み)
- キャンセルされたリクエストの codec pool エントリが isolate 生存中リークするか (最悪でも微小)
- 4GB 超アーカイブ (オフセットが 32bit を溢れる形) の `unzip -t`
- workerd での実 CPU 時間/GB (`[limits] cpu_ms` の決定材料。CRC 実測 563MiB/s は Node の値)

### 失敗の観測性: クライアント切断だけ `onError` を通らない (実機テスト中に判明)

| ケース | `createZipStream` の `onError` | ログに出るもの |
|---|---|---|
| エントリ間で throw (R2 の get 失敗相当) | **発火する** | `[spike] stream aborted: ...` + uncaught 数件 |
| エントリの body が途中で切れる | **発火する** | 同上 |
| **クライアント切断** | **発火しない** | `Uncaught Error: Network connection lost.` のみ |

実装では「DL が失敗した」と「ユーザーがやめた」を区別してログに残せる。
ただし**切断は `onError` では拾えない**ので、必要なら `request.signal` の abort を別に見る。

---

## 11. 実機検証の結果 (2026-08-24, iPad / Android / Windows)

`wrangler dev` を LAN に開いて、Windows のポートプロキシ経由で実機から検証した。
**macOS と iPhone は手元に無い** (iPad で代替)。

| | 内容 | 結果 |
|---|---|---|
| ① | 平文 HTTP のページからの DL | **OK**。ただし form POST で「送信しようとしている情報は保護されません」の警告が出る (HTTP 固有。本番の HTTPS では出ない) |
| ② | 発火方法 4 通り | **`_self` はページが残ったまま DL された** / `_blank` は別タブが開く / **隠し iframe はエラー** / `<a href>` GET は保存できた |
| ③ | `_self` × ジェスチャ 4 通り (同期 / sleep(300) / 実 RTT / トークン先読み) | **4 つとも DL 可能** |
| ④ | **2GB を iPad で** | **完走。バックグラウンドに回しても継続する** |
| ⑤ | 5GB を Windows で (`sizeKnown` 0 / 1 の両方) | **どちらも DL・解凍とも可能** = ZIP64 版もエクスプローラーで開ける |
| ⑥ | ヘッダ送出後の失敗 (`failAt` / `failMid`) | **全デバイスで DL は「完了」扱いになり、開く・解凍はできない** |

### 決着したこと

- **Q3 (本命) 合格。** iPad が数 GB の chunked attachment をディスクへ流し、バックグラウンドでも
  継続し、開ける ZIP を残す。**サーバー ZIP 化の前提が成立した**
- **Q4 / Q5 は `_self` で決着。** `_self` は普通のナビゲーションなのでポップアップブロッカーが
  関与せず、`await getIdToken()` を挟んでも submit は弾かれない (③ で実証)。
  → **認証方式は C (form POST + `target="_self"`) で確定。D1 チケット (A 案) は不要**
- **隠し iframe は採用しない。** `_self` で足りるので深追いしない
- **ZIP64 版 (`sizeKnown=0`) も Windows のエクスプローラーで開けた。** 実装は常に size を渡す
  (§9 Q7) ので ZIP64 は避けるが、万一混ざっても Windows では開ける。macOS は未検証

### ⑥ の結果を受けた設計変更: 中断しない。ただし全量バッファは実測で却下した

ブラウザは**壊れた ZIP を「ダウンロード完了」として保存する**。ユーザーには失敗が見えず、
開こうとした時点で初めて壊れていることが分かる。だから「1 枚失敗したら ZIP ごと壊す」は採れない。

最初は「**1 枚ずつ全量バッファしてから add**」を考えた (add を呼ぶ時点で全バイトが揃っていれば
エントリ途中で壊れる経路が消える)。**実測で却下した:**

| | 1GB 転送時の RSS 増加 (遅い読み手 20MB/s、20MB × 50 エントリ) |
|---|---|
| ストリーミング | **+92 MB** |
| 全量バッファ | **+4,242 MB** |

20MB の `Uint8Array` は V8 の large object space に行き、local workerd (ヒープ上限が
実質無制限) では major GC が走らないまま積み上がった。本番の 128MB isolate なら GC は
走るはずだが (**未検証**)、いずれにせよライブセットが 1 枚 20MB + パイプライン中のコピーで
128MB に対して余裕がない。**全量バッファは採らない。**

### 採用する形: ストリーミングのまま「get 失敗はスキップ」

現実の失敗はほぼ「R2 の `get()` が null / 例外を返す」で、これは**バイトを 1 つも書く前に
分かる**。ここでスキップすれば ZIP は壊れない。

- `get()` の失敗 → **その 1 枚をスキップして続行**し、最後に `MISSING.txt` を同梱して正常に閉じる
- **ヘッダ送出前に D1 で全 ID の所有権と存在を 1 クエリで検証する。** ここで落ちればまだ
  404 / 403 を返せる。ヘッダを送るともう戻れない
- 残る穴は「R2 の body が転送途中で死ぬ」ケースだけ。**これは書き込み済みのバイトを
  取り消せないので ZIP が壊れる**。同一データセンター内の通信なので確率は低いと判断し、
  観測 (`onError`) だけ入れて受け入れる
- EXIF 差し替えは `applyExifCredit` の先頭バッファ (256KB) で足りるので、全量バッファは不要

spike で実測 (streaming モード):

| 注入 | 結果 |
|---|---|
| `failAt=3` (get 失敗) | 4 枚 + `MISSING.txt` の**正常な ZIP**。`unzip -l` で確認 |
| `failMid=3` (body 断) | 壊れた ZIP (セントラルディレクトリ無し)。想定どおり |


実機でも確認済み: `failAt=3` の ZIP は**端末で開けて `MISSING.txt` が読める**。
⑥ の「DL 完了だけど開けない」に対する対策が実機で裏付けられた。

### spike で残っているのは 2 点だけ (どちらも `wrangler login` 待ち)

| | なぜ必要か |
|---|---|
| Q2: 実際の 128MB isolate | ローカルはヒープ上限が実質無制限。ストリーミングの +92MB は本番でも同じか |
| Q6: subrequest 上限 | **1 回の ZIP に含められる枚数の上限が決まる = UI に影響する** |

本番の HTTPS + HTTP/2/3 での挙動も同時に潰せる (LAN の平文 HTTP/1.1 しか試せていない)。

---

## 12. エッジ (`wrangler dev --remote`) の実測 — **方針を揺るがす結果** (2026-08-24)

`wrangler login` 後、バインディング無しの spike config を `--remote` で Cloudflare のエッジ上で
実行して測った。ローカル workerd では見えなかった制限が出た。

### Q2 メモリ: **合格**

実際の 128MB isolate 上で、64MB の ZIP を `--limit-rate 2M` の遅い読み手に 30 秒かけて流して
完走 (`unzip -t` OK)。**ストリーミングなら本番の isolate でもメモリは有界。**

### Q6 subrequest 上限: **50**

`mode=fetch&count=1500` → **50 件で `Too many subrequests by single Worker invocation`**。
以降 1450 件は設計どおりスキップされ、`MISSING.txt` 付きの**正常な ZIP** が返った
(エラー処理の設計はここでも機能した)。

**50 は Workers Free プランの上限** (Paid は 1,000)。`[limits] subrequests = 1000` を
書いても変わらなかった。

### CPU: 1 リクエストあたり **約 96MB が上限**。しかも連続リクエストで枯れる

| 1 エントリのサイズ | 結果 |
|---|---|
| 8MB / 64MB / 96MB | OK |
| 128MB / 256MB | **`Worker exceeded CPU time limit.`** (128MB は 24MB 送出後、256MB は 113MB 送出後に切断) |

`[limits] cpu_ms = 300000` を書いてアップロードは通るが、**効いていない**
(256MB は同じく CPU 超過で落ちた)。**Paid でないと `cpu_ms` は上げられない**ので、
これも Free プランの症状。

さらに悪いことに、**連続した重いリクエストで枯れる**:

| | 結果 |
|---|---|
| 64MB のリクエスト直後に 30 枚 × 2MB (60MB) | **CPU 超過で失敗** |
| 90 秒待ってから同じ 30 枚 × 2MB | **OK** (10.4 秒で完走) |

つまり 1 リクエスト単独では通るサイズでも、**別の受信者が直前に一括 DL していると落ちる**。

### これが意味すること

現在のプランのままだと 1 回の ZIP は **約 48 枚 / 約 60〜96MB** が上限で、しかも同時・連続の
DL に弱い。**クライアント ZIP の iOS 天井 (推定 40〜70 枚) と大差がない** ため、
サーバー ZIP 化の主目的 (枚数に依存しない一括 DL) が達成できない。

**Workers Paid ($5/月) が実質の前提条件になる** (subrequests 1,000 / `cpu_ms` を最大 5 分まで
設定可 → §3 の試算どおり 10GB 全件でも収まる)。§3 のコスト試算はもともと Paid を前提にしていた。

### 未確定: preview と本番デプロイで制限が違う可能性

上の数字はすべて `wrangler dev --remote` の **preview** で測った。**deployed worker では
制限が違う可能性がある** (未検証)。確認には使い捨て worker の `wrangler deploy` が必要で、
これは実行時に権限で止められた。判断の前にここを確定させるべき。

### 訂正: §12 の CPU 上限は `--remote` preview の値で、本番の値ではない

公式ドキュメントで Free = **10ms CPU / invocation**、Paid = 既定 30s (最大 5 分) と確認した。
ところが preview では 96MB の ZIP (実測レート 1.78 CPU-ms/MiB なら約 171 CPU-ms) が通っている。
つまり **preview は Free の 10ms を強制していない**。`[limits] cpu_ms` も効かなかったので
**設定済み Paid の値でもない**。さらに 256MB は 120 秒クールダウン後の単発でも落ち、
落ちる位置が毎回変わる (33MB / 113MB)。

→ **`wrangler dev --remote` の CPU 挙動は本番の代理にならない。§12 の「約 96MB が上限」
「連続リクエストで枯れる」は preview の性質として記録し、本番の制約としては採用しない。**
Paid にしたうえで **deployed worker** で測り直す。

subrequest = 50 は Free の文書化された上限と一致するので、こちらは信用できる。

出典:
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/

---

## 13. 予算上限をどう掛けるか (2026-08-24)

### Cloudflare Workers に「支出上限」は無い

ドキュメントが挙げている唯一の仕組みは **`[limits] cpu_ms`** で、
"To prevent accidental runaway bills or denial-of-wallet attacks, configure the maximum amount of
CPU time that can be used per invocation" と明記されている。**1 invocation あたりの CPU 上限**
であって、月額の上限ではない。

金額ベースの spend limit は **AI Gateway 専用**の機能で、Workers には無い
(https://developers.cloudflare.com/changelog/post/2026-06-05-spend-limits/)。

### そもそも Workers 側の超過は構造的に小さい

| | |
|---|---|
| 込み枠 | 10M リクエスト / 30M CPU-ms |
| 超過単価 | $0.30 / 1M リクエスト、$0.02 / 1M CPU-ms |
| CRC32 実測 (Node) | 1.78 CPU-ms / MiB |

→ 込み枠 30M CPU-ms だけで **約 16.8 TiB/月**の ZIP を捌ける。超過しても **約 $0.036 / TiB**。
100 TB/月でも $3.6。**egress は無課金**、R2 の GetObject は Class B ($0.36/M、月 10M 無料)。

**本当のコストドライバは R2 のストレージ** ($0.015/GB・月 → 1TB で $15/月) で、これは
一括 DL の方式とは無関係 (§4.1 の目標そのまま)。

### 掛けるガードレール

1. **`[limits] cpu_ms` を明示的に設定する。** 受信者クォータは 10GB なので、全件 ZIP でも
   10GiB × 1.78 = **約 18 CPU 秒**。つまり**既定の 30s で足りる見込みで、上げる必要がない**。
   明示的に書いておけば「1 リクエストで焼ける CPU の天井」がコードに残る
   (実レートは deployed worker で測り直してから確定する)
2. **1 リクエストの枚数上限。** subrequest 上限 (Paid 1,000) から逆算して決める。
   D1 の検証クエリと R2 の get を数えたうえで余裕を持たせる
3. **ZIP エンドポイントのレート制限。** 既存の Rate Limiting binding を流用し、
   受信者 (認証済み UID) 単位で「N 回 / 分」に絞る
4. **認証必須** (既にそう)。匿名では叩けないので denial-of-wallet の入口が狭い
5. 必要なら **受信者ごとの 1 日の一括 DL 回数**を D1 でカウントする (段階的に追加可)

### 残っている確認

Paid にしたうえで **deployed worker** で測り直す:
- 1 リクエストで作れる ZIP の実サイズ上限 (= 実際の CPU-ms/MiB)
- subrequest 上限が 1,000 になること
- 上を踏まえた枚数上限と `cpu_ms` の確定値

---

## 14. Workers Paid 後のエッジ実測 (2026-08-24) — 実装の制約値が確定

`wrangler dev --remote` (バインディング無しの spike config、`[limits] cpu_ms` 明示) で再測定。

### subrequest: **枚数の制約にならない**

`mode=fetch` を**毎回異なる URL** (キャッシュに吸われないよう) で叩いて:

| count | 結果 |
|---|---|
| 1,500 / 3,000 / **6,000** | **全件成功** (`MISSING.txt` なし) |

ドキュメントの Paid = 1,000 より高い。少なくとも 6,000 までは通る。
**Q6 は解消。枚数上限は subrequest ではなく CPU で決まる。**

### CPU: **約 25 CPU-ms / MiB** (= 約 40 MiB/s)

`cpu_ms = 30000` (既定値) で:

| ZIP | 結果 |
|---|---|
| 1GB (1 エントリ) | **OK** (39s) |
| 1GB (500 エントリ × 2MB) | **OK** (27.9s) — 分割数は効かない |
| 1.5GB (1 エントリ) | **失敗** (1.30GB 送出後に CPU 超過) |
| 2GB (500 エントリ × 4MB) | **失敗** (1.88GB 送出後に CPU 超過) |

→ 30 CPU 秒で **約 1.2GB**。逆算して **約 25 CPU-ms / MiB**。
壁時計も 25〜30 MB/s なので、トンネルではなく **CPU がボトルネック**。

### §3 の CRC32 実測値 (563 MiB/s = 1.78 CPU-ms/MiB) は Node の値で、エッジでは 14 倍重い

コスト試算を訂正する:

| | §3 (Node ベース・誤り) | エッジ実測 |
|---|---|---|
| CPU コスト | 1.78 CPU-ms / MiB | **約 25 CPU-ms / MiB** |
| 込み枠 30M CPU-ms で捌ける量 | 約 16.8 TiB/月 | **約 1.2 TiB/月** |
| 超過単価 | $0.036 / TiB | **約 $0.52 / TiB** |

それでも 10 TB/月で $5.2 なので**通常運用のコストは問題にならない**。効いてくるのは
**1 リクエストあたりの上限**と **denial-of-wallet** の想定。

### `cpu_ms` の選択肢 (1 リクエストで作れる ZIP の上限)

| `cpu_ms` | 1 回の ZIP の上限 | 1 リクエスト最悪コスト |
|---|---|---|
| 30,000 (既定) | 約 1.2 GB | $0.0006 |
| 120,000 | 約 4.7 GB | $0.0024 |
| 300,000 (最大) | 約 11.7 GB (10GB クォータ全件が入る) | $0.006 |

`cpu_ms` は「1 invocation で焼ける CPU の絶対上限」なので、これが denial-of-wallet の
1 発あたりの被害額を決める。認証必須 + レート制限と組み合わせて封じる。

### EXIF 差し替えの CPU コスト: **ほぼ無視できる**

R2 を使わずに測るため、spike に `mode=jpeg` を追加した (実機相当の EXIF —
主要タグ + 20KB の MakerNote 相当 — を持つ JPEG をワーカー内で合成する)。

| | 1,100 枚 × 1MB (1.15GB) |
|---|---|
| `exif=0` | OK / 31.8s |
| `exif=1` | OK / **32.9s** |

差は 1.1 秒 / 1,100 枚 ≒ **1 枚あたり 1ms**。1,000 枚でも 30 CPU 秒に対して約 3%。
**先頭 256KB しか触らないので写真サイズに依存しない。** 上限値に置く余裕 (2 割) で十分。

### ただし `[limits] cpu_ms` は `--remote` では効かない

`cpu_ms` を 30,000 / 120,000 / 300,000 と変えても**上限は約 1.2GB のまま**変わらなかった
(120,000 で 3.5GB を試して 1.26GB 送出後に CPU 超過)。
**preview は既定の 30s を固定で強制している。**

→ **`cpu_ms` が実際に効くかは deployed worker でしか確認できない。** これが未確定のまま。
- 効く場合: `cpu_ms = 120000` → 1 回の ZIP は約 4.7GB (上限は余裕を見て 3.5GB)
- 効かない場合: 上限は約 1.2GB (余裕を見て 1GB) に下げる必要がある

---

## 15. deployed worker (本番と同じ HTTPS/HTTP2) での実測 — **制約値が確定** (2026-08-24)

`wrangler deploy --config wrangler.spike.toml` で使い捨て worker
(`furdrop-zip-spike`、バインディング無し) をデプロイして測った。

| | |
|---|---|
| transport | **HTTPS + HTTP/2** (`http_version=2`)。今までの LAN 平文 HTTP/1.1 と違い本番と同じ |
| スループット | 約 30 MB/s (計測環境の回線に依存) |

### `[limits] cpu_ms` は deployed worker では**効く**

| ZIP (`cpu_ms = 120000`) | 結果 |
|---|---|
| 256MB | OK (8.6s) |
| **3.5GB (3,500 枚 × 1MB, EXIF 差し替えあり)** | **OK** (124s、`unzip -t` 通過) |
| 5GB (5,000 枚) | 失敗 (4.61GB 送出後に CPU 超過) |

→ **`cpu_ms = 120000` で上限は約 4.6GB。** 逆算して約 27 CPU-ms/MiB (preview で測った 25 とほぼ一致)。
**preview が既定 30s を固定していただけで、`cpu_ms` は正しく機能する。**

### 確定した実装の制約値

| 項目 | 値 | 根拠 |
|---|---|---|
| `[limits] cpu_ms` | **120,000** (2 分) | 1 リクエスト最悪コスト $0.0024。denial-of-wallet の 1 発の上限 |
| 1 リクエストの上限 | **合計 file_size 3.5GB** | 実測上限 4.6GB に対して約 24% の余裕。超過はヘッダ送出前に 400 で拒否 |
| 枚数 | 上限を設けない (バイト数で縛る) | 3,500 枚が通り、subrequest も 6,000 まで通る。バイト数が唯一の律速 |
| EXIF 差し替え | 1 枚あたり約 1ms | 3,500 枚でも約 3.5 CPU 秒。写真サイズに依存しない |

一眼 JPEG (15MB/枚) で **約 230 枚**、スマホ (3MB/枚) で **約 1,150 枚**が 1 回で落ちる。
現状のクライアント ZIP (iOS で推定 40〜70 枚で無言に死ぬ) からは大幅な改善。

### ZIP64 は本番では発生しない

3.5GB の上限があるので ZIP 全体が 4GB を超えることはなく、1 エントリも 20MB
(`MAX_FILE_SIZE`) 以下。**size を必ず渡す実装なので ZIP64 に入る条件が揃わない。**
§11 で Windows は ZIP64 版も開けることを確認済みだが、そこに依存しない。
(4GB 超の ZIP の展開検証は、上限があるため不要と判断した)

### 実機 (iPad) でも本番と同じ HTTPS/HTTP2 で確認済み

`https://furdrop-zip-spike.kuu13580.workers.dev/page` を iPad から開いて動作確認。
**LAN の平文 HTTP/1.1 でしか試せていないという最後の未検証項目が解消した。**
HTTPS なのでフォーム送信時の「保護されません」警告も出ない。

**spike はここで完了。** 使い捨て worker は削除する。

---

## 16. 実装完了 (2026-08-24)

spike を削除し、本実装を PR #99 に載せた。

### 追加・変更

| ファイル | 内容 |
|---|---|
| `workers/src/routes/download.ts` | `POST /download/zip`。ボディのトークン検証 → 所有権と合計サイズの検証 → ストリーミング ZIP |
| `workers/src/lib/zip-stream.ts` | `createZipStream` (add を内部で直列化) + `applyExifCredit` |
| `workers/src/lib/exif-credit.ts` | frontend 版から移植した APP1 差し替え |
| `frontend/src/lib/bulk-download.ts` | dry-run → 隠しフォーム POST (`target="_self"`) |
| `workers/wrangler.template.toml` | `[limits] cpu_ms = 120000` + `RATE_LIMITER_ZIP` (6/60秒/UID) |
| 削除 | `frontend/src/lib/zip-download.ts` / `frontend/src/components/BatchDownloadModal.tsx` / 一括 DL の `beforeunload` 抑止 |

テスト: frontend 64 / workers 82 (+2 skip) / E2E 37。`pnpm check` `pnpm typecheck` `pnpm i18n:check` すべて green。

### E2E がクロスオリジンのフォーム POST を実証している

E2E はフロントが `localhost:4000`、API が `localhost:9000` = **別オリジン**。
`receiver-bulk-download.spec.ts` が通っているので、**クロスオリジンのフォーム POST →
attachment のダウンロード発火 → ページは残る**が Chromium で実証されている。

### 残っている未検証 (PR の Test plan に回す)

- ~~iOS/iPadOS Safari での「クロスオリジン」フォーム POST~~ → **#99 のデプロイ後に実機で
  確認済み (2026-08-26)。** spike のページは worker 自身が配信していて same-origin だったので
  残していた差分。本番の SPA (Pages) → API (Workers) の別ホスト構成でフォーム POST が発火し、
  ZIP も開けた (ナビゲーションに CORS は効かないという読みどおり)
- 単体 DL の EXIF 差し替えはクライアントに残している (`frontend/src/lib/exif-credit.ts`)。
  1 枚なのでメモリの上界が問題にならず、「記録しない」を presigned URL の直リンクのまま
  保てるため。EXIF のロジックがサーバーとクライアントの 2 か所にある点は認識している
- piexif の load → dump で MakerNote / MPF の絶対オフセットが壊れる可能性
  (requirements.md の R17 に既知の制限として記載済み)

---

## 17. 3 回目の Fable レビューで直したもの (2026-08-24)

### 要修正 1: dry-run では塞ぎきれない隙間があった

`dry_run` を通しても実 POST が失敗しうる:

- **レート制限のパリティ崩れ**: limiter がサイズ検証より前に走るので、`SELECTION_TOO_LARGE` で
  落ちた dry-run も 1 トークン消費していた。60 秒内に 4 回 DL + 1 回上限超過という現実的な
  操作列で「dry-run は通ったのに実 POST が 429」になり、`_self` のナビゲーションとして
  生 JSON が描画されて SPA から離脱する
- **TOCTOU**: dry-run と実 POST の間に写真が全削除されると実 POST が 404

→ **非 dry-run のエラーは JSON ではなく最小の HTML (メッセージ + `history.back()`) で返す。**
あわせて**レート制限は実 POST だけに効かせる** (dry-run では消費しない) ことでパリティ崩れも直した。
docs のレート制限表も「6/60秒」が実効 3 DL/分に見えていた誤解を解消。

### 要修正 2: `tz_offset_min` 省略時が JST ではなく UTC だった

`Number(form.get("tz_offset_min"))` は**フィールド欠落 (`null`) でも空文字でも 0 = UTC** になる。
コメントは「省略時は JST」と書いてあり、単体 DL (`TzOffsetMinQuery` の default 540) と食い違っていた。
皮肉なことに `workers/src/lib/schema.ts` のコメントがまさにこの落とし穴 (`z.coerce` が空文字を
0 にする) を警告していて、それを再導入していた。→ null / 空文字を先に弾いてから `Number` へ。

### その他の反映

- **ZIP のエントリ順を時系列 (created_at ASC) に固定した。** クライアントの選択順に依存させると、
  同名衝突時の `_2` が DL ごとに変わる
- **`MISSING.txt` から生の UUID を排除。** 「取得に失敗」はファイル名、「すでに削除されている」は
  件数だけにした (UUID はユーザーに意味がない)
- **`SELECTION_TOO_LARGE` の `selected_bytes` / `limit_bytes` をメッセージに使う** ように直した
  (返すだけ返して捨てていた)。「選択 4.2GB / 1回の上限 3.5GB」で何枚減らせばいいかが分かる
- dry-run の 404 (全写真削除済み) が「時間をおいてお試しください」に落ちていた → リトライしても
  直らないので「一覧を再読み込みして」に変更
- 選択を変えたら前回の `zipError` を消す
- **クライアント切断時に残りの R2 get を続けない** ように `request.signal.aborted` を見て抜ける
  (workerd が切断で invocation を kill するかは**未検証**なので保険)
- `[limits] cpu_ms` が **worker 全体に効く** (ZIP 以外のルートの上限も 30s→120s になる) ことを
  architecture.md と template のコメントに明記

### レビューで「問題なし」と確認できたこと

- **CSRF 対策は不要**。このエンドポイントは Cookie 等の ambient authority を一切使わず、
  **ボディのトークン自体が CSRF トークンの役割**を果たすので、クロスオリジンの POST を
  受けても攻撃者は被害者の権限で何もできない
- **session_index は単体 DL と一致する** (順序定義が同一。`session_id IS NULL` は両方 1)
- `parseIds` は `Set` の挿入順を保つので選択順は失われない (自分の誤認だった)
- **dry-run のコストは許容** (D1 read は $0.001/M 行)
- **スケールは許容**。行数の上界はクォータで縛られる (15MB/枚で ~680 行、3MB/枚で ~3,400 行)
- `zipName` の handle は `^[a-z0-9_]{3,32}$` 検証済みでヘッダインジェクション不可

### 追加したテスト

`dry_run=1` の応答形状 / **ZIP のエントリ名が単体 DL の `filename` と一致すること** (連番の
算出方法が違うので片方だけ壊れても気づける) / `tz_offset_min` 省略時のファイル名 (要修正 2 の
回帰ガード) / 非 dry-run のエラーが HTML で返ること。workers は 86 passed / 2 skipped。
