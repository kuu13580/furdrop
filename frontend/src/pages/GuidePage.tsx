import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode, useState } from "react";
import { Link, useNavigate } from "react-router";
import logoUrl from "../assets/logos/logo.png";
import LocaleToggle from "../components/ui/LocaleToggle";
import { SOURCE_LOCALE } from "../lib/i18n";

const FEEDBACK_URL = import.meta.env.VITE_FEEDBACK_URL ?? "";
const PUBLIC_HOST = import.meta.env.VITE_PUBLIC_HOST ?? "furdrop.app";

const MONO = "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

type Audience = "sender" | "receiver";

// title / alt / caption は module scope の定数なので `t` ではなく `msg` で持ち、
// 描画時に `i18n._()` を通す。body の <Trans> は描画時に解決されるのでそのままでよい
type Step = {
  num: string;
  title: MessageDescriptor;
  body: ReactNode;
  /** スクリーンショットを差し込む領域。コメントで撮るべき画面を指示する */
  image: { src: string; alt: MessageDescriptor; caption: MessageDescriptor };
  highlight?: boolean;
};

/**
 * 「使い方ガイド」ページ。
 * 送信者・受信者をタブで切り替え、実際の画面に沿った手順を表示する。
 * 図版は `pnpm shots` で `/__shots/:slug` から日英ぶん撮る。
 */
export default function GuidePage() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [audience, setAudience] = useState<Audience>("sender");

  const steps = audience === "sender" ? SENDER_STEPS : RECEIVER_STEPS;

  return (
    <div className="flex min-h-dvh flex-col bg-surface-canvas text-ink antialiased">
      {/* Header — LegalPage と同じスタイルで統一感を保つ */}
      <header className="sticky top-0 z-20 border-b border-surface-sand-deep bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center" aria-label={t`FurDrop ホーム`}>
            <img src={logoUrl} alt="FurDrop" className="h-9" />
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (window.history.length > 1) navigate(-1);
                else navigate("/");
              }}
              className="rounded-lg px-3 py-2 text-[14px] text-ink-soft transition-colors hover:bg-surface-sand hover:text-ink"
            >
              <Trans>戻る</Trans>
            </button>
            <LocaleToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        {/* Hero */}
        <section className="mb-8 sm:mb-12">
          <p
            className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand"
            style={{ fontFamily: MONO }}
          >
            How to use
          </p>
          <h1 className="text-[26px] font-bold leading-[1.25] tracking-[-0.02em] text-balance text-ink sm:text-[36px]">
            <Trans>FurDropの使い方</Trans>
          </h1>
          <p className="mt-3 max-w-2xl text-[14px] leading-[1.85] text-ink-soft [overflow-wrap:anywhere] sm:text-[15px]">
            <Trans>
              写真を「送る人」と「受け取る人」、それぞれの立場で必要な手順をまとめました。
              アカウント登録は受け取る人だけ。送る人はリンクを開くだけで使えます。
            </Trans>
          </p>
        </section>

        {/* タブ切替 — Sand 台座の pill。Settings の EmbedModeRadioGroup と同じ語彙 */}
        <div
          role="tablist"
          aria-label={t`読みたい手順を選ぶ`}
          className="mb-8 grid grid-cols-2 gap-1.5 rounded-2xl bg-surface-sand p-1 sm:max-w-md sm:p-1.5"
        >
          <TabButton
            active={audience === "sender"}
            onClick={() => setAudience("sender")}
            label={t`送る人へ`}
            sublabel="Sender"
          />
          <TabButton
            active={audience === "receiver"}
            onClick={() => setAudience("receiver")}
            label={t`受け取る人へ`}
            sublabel="Receiver"
          />
        </div>

        {/* 手順本体 */}
        <section
          aria-labelledby="guide-heading"
          className="space-y-6 sm:space-y-8"
          // role/state をタブパネルとして公開
          role="tabpanel"
        >
          <h2 id="guide-heading" className="sr-only">
            {audience === "sender" ? t`送信者向け手順` : t`受信者向け手順`}
          </h2>
          {steps.map((step) => (
            <StepCard key={step.num} step={step} />
          ))}
        </section>

        {/* もう一方への導線 — 立場が変わったら反対側のガイドに飛べるように */}
        <section className="mt-12 rounded-[20px] border border-surface-sand-deep bg-surface p-6 sm:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted">
            <Trans>もう一方の使い方</Trans>
          </p>
          {audience === "sender" ? (
            <div className="mt-2">
              <h3 className="text-balance text-[18px] font-semibold tracking-[-0.005em] text-ink">
                <Trans>自分も写真を受け取りたい？</Trans>
              </h3>
              <p className="mt-1 text-[14px] leading-[1.7] text-ink-soft">
                <Trans>X (Twitter) アカウントで30秒で登録できます。</Trans>
              </p>
              <button
                type="button"
                onClick={() => setAudience("receiver")}
                className="mt-4 inline-flex items-center rounded-xl border border-surface-sand-deep bg-surface-sand px-4 py-2.5 text-[14px] font-medium text-ink transition-colors hover:bg-surface-sand-hover"
              >
                <Trans>受け取る人の手順を見る →</Trans>
              </button>
            </div>
          ) : (
            <div className="mt-2">
              <h3 className="text-balance text-[18px] font-semibold tracking-[-0.005em] text-ink">
                <Trans>友達から共有リンクを受け取った？</Trans>
              </h3>
              <p className="mt-1 text-[14px] leading-[1.7] text-ink-soft">
                <Trans>送る側はアカウント不要。リンクを開くだけで写真を送れます。</Trans>
              </p>
              <button
                type="button"
                onClick={() => setAudience("sender")}
                className="mt-4 inline-flex items-center rounded-xl border border-surface-sand-deep bg-surface-sand px-4 py-2.5 text-[14px] font-medium text-ink transition-colors hover:bg-surface-sand-hover"
              >
                <Trans>送る人の手順を見る →</Trans>
              </button>
            </div>
          )}
        </section>

        {/* Footer links — Legal / フィードバック */}
        <nav className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-surface-sand-deep pt-6 text-[13px]">
          <Link to="/" className="text-ink-soft transition-colors hover:text-ink">
            <Trans>トップへ戻る</Trans>
          </Link>
          <Link to="/terms" className="text-ink-soft transition-colors hover:text-ink">
            <Trans>利用規約</Trans>
          </Link>
          <Link to="/privacy" className="text-ink-soft transition-colors hover:text-ink">
            <Trans>プライバシーポリシー</Trans>
          </Link>
          {FEEDBACK_URL && (
            <a
              href={FEEDBACK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-soft transition-colors hover:text-ink"
            >
              <Trans>不明点をフィードバック</Trans>
            </a>
          )}
        </nav>
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  sublabel,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sublabel: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex flex-col items-center justify-center rounded-xl px-2 py-2.5 text-center transition-all sm:px-3 ${
        active ? "bg-surface text-ink shadow-card" : "text-ink-soft hover:text-ink"
      }`}
    >
      <span className="whitespace-nowrap text-[14px] font-semibold sm:text-[15px]">{label}</span>
      <span
        className="mt-0.5 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted sm:text-[11px]"
        style={{ fontFamily: MONO }}
      >
        {sublabel}
      </span>
    </button>
  );
}

/**
 * 図版は UI ごと日英で撮り分けてある (`pnpm shots`)。原文ロケールは接尾辞なし、
 * それ以外は `-<locale>` 付き。命名は OG 画像 (og.png / og-en.png) と揃えている。
 */
function shotSrc(src: string, locale: string) {
  return locale === SOURCE_LOCALE ? src : src.replace(/\.png$/, `-${locale}.png`);
}

function StepCard({ step }: { step: Step }) {
  const { i18n } = useLingui();
  return (
    <article
      className={`grid grid-cols-1 gap-5 overflow-hidden rounded-[20px] border bg-surface p-5 shadow-card sm:p-7 md:grid-cols-[1.1fr_1fr] md:gap-8 md:p-8 ${
        step.highlight ? "border-brand/40" : "border-surface-sand-deep"
      }`}
    >
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            className={`inline-flex h-9 items-center justify-center whitespace-nowrap rounded-full px-3 text-[13px] font-bold ${
              step.highlight ? "bg-brand text-white" : "bg-brand-tint text-brand-deep"
            }`}
            style={{ fontFamily: MONO }}
          >
            STEP {step.num}
          </span>
          {step.highlight && (
            <span className="whitespace-nowrap rounded-full bg-status-warn/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-status-warn">
              <Trans>最重要</Trans>
            </span>
          )}
        </div>
        <h3 className="text-balance text-[20px] font-bold leading-[1.3] tracking-[-0.01em] text-ink sm:text-[22px]">
          {i18n._(step.title)}
        </h3>
        <div className="mt-3 space-y-3 text-[14px] leading-[1.85] text-ink-soft [overflow-wrap:anywhere]">
          {step.body}
        </div>
      </div>
      <figure className="self-start md:order-last">
        <div className="overflow-hidden rounded-2xl border border-surface-sand-deep bg-surface-canvas">
          <img
            src={shotSrc(step.image.src, i18n.locale)}
            alt={i18n._(step.image.alt)}
            loading="lazy"
            className="block h-auto w-full"
          />
        </div>
        <figcaption className="mt-2 text-[12px] leading-[1.6] text-ink-muted [overflow-wrap:anywhere]">
          {i18n._(step.image.caption)}
        </figcaption>
      </figure>
    </article>
  );
}

// ────────────────────────────────────────────
// 送信者向け手順
// ────────────────────────────────────────────

const SENDER_STEPS: Step[] = [
  {
    num: "01",
    title: msg`共有リンクを開く`,
    body: (
      <>
        <p>
          <Trans>
            受け取る人から送られてきた
            <code className="mx-0.5 inline-block max-w-full break-all rounded bg-surface-sand px-1.5 py-0.5 align-baseline font-mono text-[0.95em] text-ink">
              {PUBLIC_HOST}/send/...
            </code>
            という形のリンクを、ブラウザで開いてください。
          </Trans>
        </p>
        <p>
          <Trans>
            相手のプロフィールが表示されたら、
            <strong className="font-semibold text-ink">「写真を送る」</strong>
            ボタンをタップします。
          </Trans>
          <br />
          <span className="text-[13px] text-ink-muted">
            <Trans>※ アカウント登録やログインは必要ありません。</Trans>
          </span>
        </p>
      </>
    ),
    image: {
      src: "/guide/sender-step1.png",
      alt: msg`受信者のプロフィール画面`,
      caption: msg`受信者のプロフィールと「写真を送る」ボタンが表示されます。`,
    },
  },
  {
    num: "02",
    title: msg`写真を選ぶ`,
    body: (
      <>
        <p>
          <Trans>
            点線で囲まれたエリアに写真をドラッグ＆ドロップするか、タップしてファイルを選びます。
            一度に複数枚まとめて選択できます。
          </Trans>
        </p>
        <ul className="list-disc space-y-1 pl-5 text-[13.5px] marker:text-ink-muted">
          <li>
            <Trans>
              対応形式: <strong className="text-ink">JPEG / PNG / HEIC</strong>
            </Trans>
          </li>
          <li>
            <Trans>
              1枚あたり最大 <strong className="text-ink">20MB</strong> ／ 1度に最大{" "}
              <strong className="text-ink">100枚</strong>
            </Trans>
          </li>
          <li>
            <Trans>iPhoneのHEICはアップロード時にJPEGへ自動変換されます</Trans>
          </li>
        </ul>
        <p className="text-[13px] text-ink-muted">
          <Trans>選び直したいときは、各サムネイル右上の「×」で個別に取り消せます。</Trans>
        </p>
      </>
    ),
    image: {
      src: "/guide/sender-step2.png",
      alt: msg`ドロップゾーンとサムネイル一覧`,
      caption: msg`選んだ写真は即座にプレビューが表示されます。`,
    },
  },
  {
    num: "03",
    title: msg`撮影者情報を入力する`,
    highlight: true,
    body: (
      <>
        <p>
          <Trans>
            ここがFurDropの
            <strong className="font-semibold text-ink">いちばん大切なステップ</strong>
            です。
          </Trans>
          <br />
          <Trans>
            <strong className="font-semibold text-ink">送信者名 / Twitter ID</strong>{" "}
            を入力すると、その情報を写真に残せるようになります。
          </Trans>
        </p>
        <div className="rounded-xl bg-surface-canvas px-4 py-3 text-[13px]">
          <p className="font-semibold text-ink">
            <Trans>入力した名前の使われ方</Trans>
          </p>
          <p className="mt-1 text-ink-soft">
            <Trans>
              受け取る人の一覧に表示されるほか、EXIF埋め込みの内容と、透かしの初期テキストにも
              そのまま使われます。透かしの文字は編集ダイアログで自由に変更できます。
            </Trans>
          </p>
        </div>
        <p>
          <Trans>受け取る人が許可している場合のみ、次の埋め込みオプションが表示されます。</Trans>
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] marker:text-ink-muted">
          <li>
            <Trans>
              <strong className="text-ink">EXIFカメラモデル欄に埋め込む</strong>
              ：写真のメタデータに名前を残します（あとから消すことも可能）
            </Trans>
          </li>
          <li>
            <Trans>
              <strong className="text-ink">透かしを入れる</strong>
              ：画像そのものに名前を描き込みます。位置・サイズ・透明度・色は{" "}
              <em className="not-italic text-ink">「透かしを編集」</em>{" "}
              から細かく調整できます（一度入れると消せません）
            </Trans>
          </li>
        </ul>
        <p className="rounded-xl border border-status-warn/30 bg-status-warn/10 px-4 py-3 text-[13px] text-ink">
          <Trans>
            ⚠️
            受け取る人が「必須」に設定している場合は、送信者名の入力が必須となり、対応する埋め込みも自動でONになります。
          </Trans>
        </p>
      </>
    ),
    image: {
      src: "/guide/sender-step3.png",
      alt: msg`送信者名と埋め込みオプションのフォーム`,
      caption: msg`受け取る側の設定で「必須」になっている項目は最初からONで動かせません。`,
    },
  },
  {
    num: "04",
    title: msg`送信する`,
    body: (
      <>
        <p>
          <Trans>
            画面下部の <strong className="font-semibold text-ink">「送信する (○枚)」</strong>{" "}
            ボタンをタップすると、写真の加工とアップロードが始まります。
          </Trans>
        </p>
        <ul className="list-disc space-y-1 pl-5 text-[13.5px] marker:text-ink-muted">
          <li>
            <Trans>進行中はファイルごとの状態（待機 / 送信中 / 完了）が表示されます</Trans>
          </li>
          <li>
            <Trans>送信中はブラウザを閉じないでください</Trans>
          </li>
          <li>
            <Trans>失敗しても残りの写真は送信され、失敗分のみ再試行できます</Trans>
          </li>
        </ul>
        <p>
          <Trans>
            完了画面まで進めば送信終了です。「別の写真を送る」から続けて送ることもできます。
          </Trans>
        </p>
      </>
    ),
    image: {
      src: "/guide/sender-step4.png",
      alt: msg`アップロード進行と送信完了画面`,
      caption: msg`完了マークが出れば、相手のギャラリーに写真が届いています。`,
    },
  },
];

// ────────────────────────────────────────────
// 受信者向け手順
// ────────────────────────────────────────────

const RECEIVER_STEPS: Step[] = [
  {
    num: "01",
    title: msg`X (Twitter) でログインしてURLを作る`,
    body: (
      <>
        <p>
          <Trans>
            ログイン画面から
            <strong className="font-semibold text-ink">X (Twitter) アカウントで連携</strong>
            すると、受信用のページが作成できます。
          </Trans>
        </p>
        <ul className="list-disc space-y-1 pl-5 text-[13.5px] marker:text-ink-muted">
          <li>
            <Trans>
              ハンドル（URLの末尾）：
              <code className="mx-0.5 inline-block max-w-full break-all rounded bg-surface-sand px-1.5 py-0.5 align-baseline font-mono text-[0.95em] text-ink">
                小文字英数字とアンダースコア・3〜32文字
              </code>
            </Trans>
          </li>
          <li>
            <Trans>表示名：プロフィールに表示される、相手から見える名前</Trans>
          </li>
        </ul>
        <p className="text-[13px] text-ink-muted">
          <Trans>メールアドレスは公開されません。送る人にもあなたのメアドは伝わりません。</Trans>
        </p>
      </>
    ),
    image: {
      src: "/guide/receiver-step1.png",
      alt: msg`ハンドルと表示名の登録フォーム`,
      caption: msg`ハンドルがそのまま受信URLになります。後から変更したい場合はサポートまで。`,
    },
  },
  {
    num: "02",
    title: msg`受け取り用URLを共有する`,
    body: (
      <>
        <p>
          <Trans>
            ダッシュボードの
            <strong className="font-semibold text-ink">「あなたの受信URL」</strong>
            に、自分専用のリンクが表示されます。共有方法は3通り。
          </Trans>
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] marker:text-ink-muted">
          <li>
            <Trans>
              <strong className="text-ink">コピー</strong>
              ：URLをクリップボードにコピーして、SNSやメッセージに貼れます
            </Trans>
          </li>
          <li>
            <Trans>
              <strong className="text-ink">QR</strong>
              ：QRコードを表示・ダウンロード。名刺やイベントポスターへの掲載に
            </Trans>
          </li>
          <li>
            <Trans>
              <strong className="text-ink">シェア</strong>
              ：スマホの共有メニュー（または X 投稿フォーム）が立ち上がります
            </Trans>
          </li>
        </ul>
        <p className="text-[13px] text-ink-muted">
          <Trans>
            URLの末尾には推測できない文字列が付いていて、これを知っている人だけが写真を送れます。URLは途中で切らず、そのまま共有してください。
          </Trans>
        </p>
      </>
    ),
    image: {
      src: "/guide/receiver-step2.png",
      alt: msg`受信URLとコピー・QR・シェアボタン`,
      caption: msg`QRはPNGでダウンロードして印刷物にも使えます。`,
    },
  },
  {
    num: "03",
    title: msg`空き容量を確認する`,
    body: (
      <>
        <p>
          <Trans>
            無料プランは
            <strong className="font-semibold text-ink">10GB</strong>
            まで保存できます（一眼JPEG換算でおよそ680枚）。
          </Trans>
        </p>
        <p>
          <Trans>ダッシュボードと設定ページに使用率バーが表示されます。</Trans>
        </p>
        <ul className="list-disc space-y-1 pl-5 text-[13.5px] marker:text-ink-muted">
          <li>
            <Trans>
              <span className="font-semibold text-status-success">緑</span>
              ：余裕あり（〜79%）
            </Trans>
          </li>
          <li>
            <Trans>
              <span className="font-semibold text-status-warn">オレンジ</span>
              ：そろそろ整理どき（80〜94%）
            </Trans>
          </li>
          <li>
            <Trans>
              <span className="font-semibold text-status-danger">赤</span>
              ：満タン間近（95%以上）
            </Trans>
          </li>
        </ul>
        <p className="text-[13px] text-ink-muted">
          <Trans>
            受信した写真には自動的にダウンロード期限（既定180日）が設定され、期限を過ぎたものは自動で削除されます。早めにギャラリーから保存しておきましょう。
          </Trans>
        </p>
      </>
    ),
    image: {
      src: "/guide/receiver-step3.png",
      alt: msg`ストレージ使用状況のプログレスバー`,
      caption: msg`残量に応じて色が変わります。`,
    },
  },
  {
    num: "04",
    title: msg`受け付け方を決める`,
    highlight: true,
    body: (
      <>
        <p>
          <Trans>
            設定ページの
            <strong className="font-semibold text-ink">「写真の受付」</strong>
            で、いつ・誰から受け取るかを切り替えられます。
          </Trans>
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] marker:text-ink-muted">
          <li>
            <Trans>
              <strong className="text-ink">写真を受け付ける</strong>
              ：オフにすると受付を一時停止できます。意図しない写真が届いたときの止め方です
            </Trans>
          </li>
          <li>
            <Trans>
              <strong className="text-ink">受信URLを知っている人だけから受け取る</strong>
              ：オフにすると、URLの末尾の文字列がなくても、ハンドルを知っている人なら誰でも送れるようになります。名刺やSNSで
              <em className="not-italic text-ink">@ハンドル</em>
              だけを見せて受け取りたいときに使えます
            </Trans>
          </li>
        </ul>
        <p>
          <Trans>
            <strong className="font-semibold text-ink">「受信オプション」</strong>
            では、送信者がどこまで自分の名前を写真に残せるかを決められます。
          </Trans>
          <br />
          <Trans>
            各項目に <em className="not-italic text-ink">無効 / 任意 / 必須</em> の3段階があります。
          </Trans>
        </p>
        <div className="overflow-hidden rounded-xl border border-surface-sand-deep">
          <table className="w-full table-fixed text-[13px]">
            <colgroup>
              {/* モード列はラベルのみで短いので固定幅。残りを挙動列が使う */}
              <col className="w-[5.5em]" />
              <col />
            </colgroup>
            <thead className="bg-surface-sand text-ink">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 text-left font-semibold">
                  <Trans>モード</Trans>
                </th>
                <th className="px-3 py-2 text-left font-semibold">
                  <Trans>挙動</Trans>
                </th>
              </tr>
            </thead>
            <tbody className="text-ink-soft [&_td]:[overflow-wrap:anywhere] [&_td]:[word-break:keep-all]">
              <tr className="border-t border-surface-sand-deep">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-ink">
                  <Trans>無効</Trans>
                </td>
                <td className="px-3 py-2">
                  <Trans>送信画面に項目を表示しない</Trans>
                </td>
              </tr>
              <tr className="border-t border-surface-sand-deep">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-ink">
                  <Trans>任意</Trans>
                </td>
                <td className="px-3 py-2">
                  <Trans>送信者が必要に応じて選択できる</Trans>
                </td>
              </tr>
              <tr className="border-t border-surface-sand-deep">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-ink">
                  <Trans>必須</Trans>
                </td>
                <td className="px-3 py-2">
                  <Trans>送信者は必ず埋め込み（送信者名の入力も必須に）</Trans>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] marker:text-ink-muted">
          <li>
            <Trans>
              <strong className="text-ink">EXIF埋め込み</strong>
              ：メタデータのみなので画像は変わりません。あとから除去も可能。
            </Trans>
          </li>
          <li>
            <Trans>
              <strong className="text-ink">透かし</strong>
              ：画像本体に焼き込まれるため
              <strong className="text-ink">取り消せません</strong>
              。「必須」にする場合は慎重に。
            </Trans>
          </li>
        </ul>
      </>
    ),
    image: {
      src: "/guide/receiver-step4.png",
      alt: msg`写真の受付チェックボックスと受信オプションの3段階ラジオボタン`,
      caption: msg`埋め込みは迷ったら「任意」がおすすめ。送る人の判断にゆだねつつ、選択肢は提示できます。`,
    },
  },
  {
    num: "05",
    title: msg`届いた写真を眺める・保存する`,
    body: (
      <>
        <p>
          <Trans>
            ダッシュボードの<strong className="font-semibold text-ink">「最近の写真」</strong>
            、または<strong className="font-semibold text-ink">ギャラリー</strong>
            から届いた写真を確認できます。
          </Trans>
        </p>
        <ul className="list-disc space-y-1 pl-5 text-[13.5px] marker:text-ink-muted">
          <li>
            <Trans>サムネイルをタップして拡大表示・送信者情報の確認</Trans>
          </li>
          <li>
            <Trans>「選択」モードで複数枚をまとめてダウンロードまたは削除</Trans>
          </li>
          <li>
            <Trans>「ダウンロード期限」を過ぎる前に必要な写真をローカル保存</Trans>
          </li>
        </ul>
      </>
    ),
    image: {
      src: "/guide/receiver-step5.png",
      alt: msg`受信写真のギャラリー一覧`,
      caption: msg`正方形の均一グリッドで、選びたい写真が一目で分かります。`,
    },
  },
];
