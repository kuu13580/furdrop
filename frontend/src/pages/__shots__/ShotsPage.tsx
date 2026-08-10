/**
 * 「使い方ガイド」用スクリーンショットを撮るための、値固定の独立 UI ページ群。
 *
 * - 本番ビルドには絡めない (App.tsx で `import.meta.env.DEV` 条件付き読み込み)
 * - Playwright は `/__shots/:slug` 配下で各カードを一意の `data-shot` セレクタで掴む
 * - 各カードは AppLayout / SenderLayout を経由しないため Footer 干渉なし
 * - スタイルは DESIGN.md & 既存 UI 部品 (Card / Button / StorageQuotaBar) を踏襲
 *
 * 撮影は `pnpm shots` (e2e/scripts/capture-guide-shots.mjs) から行う。
 */

import { useLingui } from "@lingui/react/macro";
import QRCode from "qrcode";
import { useEffect, useRef } from "react";
import { useParams } from "react-router";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import StorageQuotaBar from "../../components/ui/StorageQuotaBar";

const PUBLIC_HOST = "furdrop.app";
const SAMPLE_HANDLE = "sora_studio";
/** 日英で同じ見た目になるよう、サンプルの受信者名はロケールによらず共通にする */
const SAMPLE_DISPLAY = "Sora Studio";
const SAMPLE_KEY = "V1StGXR8_Z5jdHi6B-myT";
const RECEIVE_URL = `https://${PUBLIC_HOST}/send/${SAMPLE_HANDLE}?k=${SAMPLE_KEY}`;

/**
 * このページは Lingui の抽出対象外 (lingui.config.ts)。dev 専用のモック文言を
 * 本番カタログに混ぜないため、`<Trans>` ではなく ja/en の対を直接持つ。
 * en 側は実 UI とずれないよう `locales/en/messages.po` の訳文をそのまま写すこと。
 * ロケールはヘッダーのトグルと同じ i18n を見るので `?lang=en` で切り替わる。
 */
function useShot() {
  const { i18n } = useLingui();
  const en = i18n.locale === "en";
  return {
    c: <T,>(ja: T, enText: T): T => (en ? enText : ja),
  };
}

const SAMPLE_SENDER = "@kuukemo";
const SENDER_NAMES = [
  "@kuukemo",
  "@mochi_film",
  "@poko_lens",
  "@koharu_shot",
  "@yume_record",
  "@tsuki_iro",
];
const PHOTO_COLORS = [
  "linear-gradient(135deg,#f1bfa6,#d9967a)",
  "linear-gradient(135deg,#a99176,#7c6750)",
  "linear-gradient(135deg,#e5d6bb,#b8a486)",
  "linear-gradient(135deg,#c7a98a,#8a6f54)",
  "linear-gradient(135deg,#e7c896,#bf9a64)",
  "linear-gradient(135deg,#dab09c,#a37760)",
];

/** スクショ単位のラッパ — Cream 背景で UI を浮かせる */
function Frame({
  slug,
  children,
  pad = "p-6",
  width = 720,
}: {
  slug: string;
  children: React.ReactNode;
  pad?: string;
  width?: number;
}) {
  return (
    <div
      data-shot={slug}
      className={`${pad} bg-surface-canvas`}
      style={{ width, fontFamily: '"Inter", "Noto Sans JP", sans-serif' }}
    >
      {children}
    </div>
  );
}

function FakePhoto({ idx, className = "" }: { idx: number; className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-xl ${className}`}
      style={{ background: PHOTO_COLORS[idx % PHOTO_COLORS.length] }}
    />
  );
}

/* ─────────────────── 送信者 ─────────────────── */

function SenderStep1() {
  const { c } = useShot();
  return (
    <Frame slug="sender-step1" pad="p-10" width={560}>
      <div className="rounded-[20px] bg-surface p-8 shadow-modal">
        <div className="space-y-5 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-white bg-surface-sand text-[32px] font-semibold text-ink-soft shadow-card">
            {SAMPLE_DISPLAY.charAt(0)}
          </div>
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">
              {SAMPLE_DISPLAY}
            </h1>
            <p className="mt-1 font-mono text-[14px] text-ink-soft">@{SAMPLE_HANDLE}</p>
          </div>
          <p className="text-[14px] text-ink-soft">
            {c(`写真を${SAMPLE_DISPLAY}さんに送れます`, `You can send photos to ${SAMPLE_DISPLAY}`)}
          </p>
          <button
            type="button"
            className="block w-full rounded-xl bg-brand px-4 py-3 text-[16px] font-medium text-white"
          >
            {c("写真を送る", "Send photos")}
          </button>
        </div>
      </div>
    </Frame>
  );
}

function SenderStep2() {
  const { c } = useShot();
  return (
    <Frame slug="sender-step2" pad="p-8" width={840}>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-lg px-2 py-1 text-[14px] text-ink-soft">
            {c("< 戻る", "< Back")}
          </span>
          <h1 className="truncate text-[16px] font-semibold text-ink">
            {c(`${SAMPLE_DISPLAY}さんへ送信`, `Send to ${SAMPLE_DISPLAY}`)}
          </h1>
          <div className="w-12" />
        </div>

        <div className="rounded-[24px] border-2 border-dashed border-surface-sand-deep bg-surface/60 p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint text-brand">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-7 w-7"
              aria-hidden="true"
            >
              <title>upload</title>
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </div>
          <p className="mt-4 text-[18px] font-semibold tracking-[-0.01em] text-ink">
            {c("写真をここにドロップ", "Drop your photos here")}
          </p>
          <p className="mt-1 text-[14px] text-ink-soft">
            {c("またはタップしてファイルを選択", "or tap to choose files")}
          </p>
          <p className="mt-3 font-mono text-[11px] text-ink-muted">
            {c(
              "JPEG / PNG / HEIC ・ 最大 20MB / 枚 ・ 100 枚まで",
              "JPEG / PNG / HEIC · up to 20MB each · 100 photos max",
            )}
          </p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-[14px]">
            <span className="font-medium text-ink">{c("6枚選択中", "6 photos selected")}</span>
            <span className="text-ink-soft">{c("すべてクリア", "Clear all")}</span>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {PHOTO_COLORS.map((color, i) => (
              <div
                key={color}
                className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-surface-canvas"
              >
                <FakePhoto idx={i} className="h-[78%] w-[78%]" />
                <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink/55 text-[13px] text-white backdrop-blur-sm">
                  ×
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

function SenderStep3() {
  const { c } = useShot();
  const credit = (
    <code className="mx-0.5 rounded bg-surface-sand px-1.5 py-0.5 font-mono text-[0.95em] text-ink">
      {SAMPLE_SENDER}
    </code>
  );
  return (
    <Frame slug="sender-step3" pad="p-10" width={720}>
      <Card>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="sn" className="block text-[14px] font-medium text-ink">
              {c("送信者名 / TwitterID", "Your name / Twitter ID")}
            </label>
            <input
              id="sn"
              readOnly
              value={SAMPLE_SENDER}
              className="block w-full rounded-xl border border-surface-sand-deep bg-surface px-4 py-3 text-[14px] text-ink"
            />
            <p className="text-[13px] text-ink-soft">
              {c(
                "受信者に表示されます。EXIF埋め込みにもこの名前が使われます",
                "Shown to the recipient. This name is also used for the EXIF embed",
              )}
            </p>
          </div>

          <div className="space-y-3 border-t border-surface-sand-deep pt-4">
            <label className="flex items-start gap-2.5 text-[14px]">
              <input
                type="checkbox"
                checked
                readOnly
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
              />
              <span>
                <span className="font-medium text-ink">
                  {c("EXIFカメラモデル欄に埋め込む", "Embed in the EXIF camera model field")}
                </span>
                <span className="mt-0.5 block text-[13px] text-ink-soft">
                  {c(
                    <>メタデータに送信者名{credit}を書き込みます（元のカメラ情報は上書き）</>,
                    <>
                      Writes your name {credit} into the metadata (the original camera info is
                      overwritten)
                    </>,
                  )}
                </span>
              </span>
            </label>
            <div>
              <label className="flex items-start gap-2.5 text-[14px]">
                <input
                  type="checkbox"
                  checked
                  readOnly
                  className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                />
                <span>
                  <span className="font-medium text-ink">
                    {c("透かしを入れる", "Add a watermark")}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-ink-soft">
                    {c(
                      "画像に文字や四角形を描き込みます（不可逆）。初期設定では送信者名が右下に入り、内容・位置・フォントは自由に編集できます",
                      "Draws text and shapes onto the image (this cannot be undone). By default your name goes in the bottom right, and you can freely edit the text, position and font",
                    )}
                  </span>
                </span>
              </label>
              <div className="mt-2 pl-6">
                <Button size="sm" variant="secondary">
                  {c("透かしを編集", "Edit watermark")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </Frame>
  );
}

function SenderStep4() {
  const { c } = useShot();
  return (
    <Frame slug="sender-step4" pad="p-10" width={720}>
      <div className="space-y-6 text-center">
        <div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-status-success-tint text-[28px] text-status-success shadow-card"
          aria-hidden="true"
        >
          ✓
        </div>
        <h1 className="text-[28px] font-bold leading-[1.2] tracking-[-0.015em] text-ink">
          {c("6枚の写真を送信しました！", "Sent 6 photos!")}
        </h1>
        <div className="grid grid-cols-6 gap-2">
          {PHOTO_COLORS.map((color, i) => (
            <div
              key={color}
              className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-surface shadow-card"
            >
              <FakePhoto idx={i} className="h-[78%] w-[78%]" />
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mx-auto block max-w-sm rounded-xl bg-brand px-4 py-3 text-[16px] font-medium text-white"
        >
          {c("別の写真を送る", "Send more photos")}
        </button>
      </div>
    </Frame>
  );
}

/* ─────────────────── 受信者 ─────────────────── */

function ReceiverStep1() {
  const { c } = useShot();
  return (
    <Frame slug="receiver-step1" pad="p-10" width={620}>
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-[28px] font-bold tracking-[-0.015em] text-ink">
            {c("アカウント設定", "Account setup")}
          </h1>
          <p className="mt-2 text-[14px] text-ink-soft">
            {c(
              "写真を受け取るための公開URLを作成します",
              "Create the public URL you'll use to receive photos",
            )}
          </p>
        </div>
        <Card>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="h" className="block text-[14px] font-medium text-ink">
                {c("ハンドル", "Handle")}
              </label>
              <input
                id="h"
                readOnly
                value={SAMPLE_HANDLE}
                className="block w-full rounded-xl border border-surface-sand-deep bg-surface px-4 py-3 text-[14px] text-ink"
              />
              <p className="text-[13px] text-ink-muted">
                {c(
                  `公開URLに使われます: ${PUBLIC_HOST}/send/あなたのハンドル`,
                  `Used in your public URL: ${PUBLIC_HOST}/send/your_handle`,
                )}
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="dn" className="block text-[14px] font-medium text-ink">
                {c("表示名", "Display name")}
              </label>
              <input
                id="dn"
                readOnly
                value={SAMPLE_DISPLAY}
                className="block w-full rounded-xl border border-surface-sand-deep bg-surface px-4 py-3 text-[14px] text-ink"
              />
            </div>
            <div className="space-y-4 border-t border-surface-sand-deep pt-4">
              <p className="text-[14px] font-medium text-ink">
                {c("受信オプション", "Receiving options")}
              </p>
              <p className="text-[13px] text-ink-soft">
                {c(
                  "送信者に提示するオプションを設定します。あとから設定ページで変更できます。",
                  "Choose what to offer senders. You can change this later on the settings page.",
                )}
              </p>
              <RequireSenderNameFake />
              <EmbedModeFake kind="exif" active="optional" />
              <EmbedModeFake kind="watermark" active="disabled" />
            </div>
            <label className="flex items-start gap-2.5 border-t border-surface-sand-deep pt-4 text-[13px]">
              <input
                type="checkbox"
                checked
                readOnly
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
              />
              <span className="text-ink">
                {c(
                  <>
                    <span className="text-brand underline-offset-2">利用規約</span>および
                    <span className="text-brand underline-offset-2">プライバシーポリシー</span>
                    に同意します。
                  </>,
                  <>
                    I agree to the{" "}
                    <span className="text-brand underline-offset-2">Terms of Service</span> and the{" "}
                    <span className="text-brand underline-offset-2">Privacy Policy</span>.
                  </>,
                )}
              </span>
            </label>
            <button
              type="button"
              className="w-full rounded-xl bg-brand px-5 py-3 text-[16px] font-medium text-white"
            >
              {c("登録する", "Create account")}
            </button>
          </div>
        </Card>
      </div>
    </Frame>
  );
}

/** 送信者名必須トグル (R14) のモック。登録フォームと設定画面の両方に出る */
function RequireSenderNameFake() {
  const { c } = useShot();
  return (
    <label className="flex items-start gap-2.5">
      <input type="checkbox" checked readOnly className="mt-0.5 h-4 w-4 shrink-0 accent-brand" />
      <span>
        <span className="block text-[14px] font-medium text-ink">
          {c("送信者名の入力を必須にする", "Require senders to enter a name")}
        </span>
        <span className="mt-0.5 block text-[13px] text-ink-soft">
          {c(
            "送信者は名前 (TwitterID等) を入力しないと写真を送れなくなります",
            "Senders can't send photos without entering a name (a Twitter ID, for example)",
          )}
        </span>
      </span>
    </label>
  );
}

function EmbedModeFake({
  kind,
  active,
}: {
  kind: "exif" | "watermark";
  active: "disabled" | "optional" | "required";
}) {
  const { c } = useShot();
  const title = kind === "exif" ? c("EXIF埋め込み", "EXIF embed") : c("透かし", "Watermark");
  const desc =
    kind === "exif"
      ? c(
          "送信者がカメラモデル欄に名前を書き込みます（メタデータのみ、除去可能）",
          "Senders write their name into the camera model field (metadata only, removable)",
        )
      : c(
          "送信者が画像にクレジットテキストを描き込みます（不可逆）",
          "Senders draw credit text onto the image itself (cannot be undone)",
        );
  const opts: {
    v: "disabled" | "optional" | "required";
    label: string;
    head: string;
    tail: string;
  }[] = [
    {
      v: "disabled",
      label: c("無効", "Off"),
      head: c("送信者の", "Not shown to "),
      tail: c("画面に表示しない", "senders"),
    },
    {
      v: "optional",
      label: c("任意", "Optional"),
      head: c("送信者が", "Senders "),
      tail: c("選択できる", "can choose"),
    },
    {
      v: "required",
      label: c("必須", "Required"),
      head: c("送信者は", "Senders "),
      tail: c("必ず埋め込む", "always embed"),
    },
  ];
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[14px] font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-[13px] text-ink-soft">{desc}</p>
      </div>
      <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-surface-sand p-1">
        {opts.map((o) => {
          const on = o.v === active;
          return (
            <div
              key={o.v}
              className={`flex flex-col items-center rounded-lg px-2 py-2 text-center text-[13px] ${
                on ? "bg-surface text-ink shadow-card" : "text-ink-soft"
              }`}
            >
              <span className="font-medium">{o.label}</span>
              <span className="mt-0.5 text-[11px] text-ink-soft">
                {o.head}
                {o.tail}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReceiverStep2() {
  const { c } = useShot();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) {
      QRCode.toCanvas(ref.current, RECEIVE_URL, { width: 200, margin: 2 });
    }
  }, []);
  return (
    <Frame slug="receiver-step2" pad="p-10" width={620}>
      <Card title={c("あなたの受信URL", "Your receiving URL")}>
        <div className="space-y-3">
          <p className="break-all rounded-xl bg-surface-canvas px-3 py-2 font-mono text-[14px] text-ink">
            {RECEIVE_URL}
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-xl border border-surface-sand-deep bg-surface-sand px-3 py-2 text-[14px] font-medium text-ink">
              {c("コピー", "Copy")}
            </span>
            <span className="rounded-xl border border-surface-sand-deep bg-surface-sand-hover px-3 py-2 text-[14px] font-medium text-ink">
              QR
            </span>
            <span className="rounded-xl border border-surface-sand-deep bg-surface-sand px-3 py-2 text-[14px] font-medium text-ink">
              {c("シェア", "Share")}
            </span>
          </div>
          <div className="flex flex-col items-center gap-3 py-2">
            <canvas ref={ref} className="rounded-xl" />
            <span className="rounded-xl border border-surface-sand-deep bg-surface-sand px-3 py-1.5 text-[13px] font-medium text-ink">
              {c("QRをダウンロード", "Download QR")}
            </span>
          </div>
        </div>
      </Card>
    </Frame>
  );
}

function ReceiverStep3() {
  const { c } = useShot();
  return (
    <Frame slug="receiver-step3" pad="p-10" width={620}>
      <Card title={c("ストレージ", "Storage")}>
        <StorageQuotaBar
          used={Math.floor(2.3 * 1024 * 1024 * 1024)}
          quota={10 * 1024 * 1024 * 1024}
        />
      </Card>
    </Frame>
  );
}

function ReceiverStep4() {
  const { c } = useShot();
  return (
    <Frame slug="receiver-step4" pad="p-10" width={620}>
      <Card title={c("受信オプション", "Receiving options")}>
        <p className="mb-4 text-[13px] text-ink-soft">
          {c(
            "送信者に提示するオプションを設定します。「必須」にすると送信者は必ず埋め込みます。",
            'Choose what to offer senders. Setting an option to "Required" means senders always embed it.',
          )}
        </p>
        <div className="space-y-5">
          <RequireSenderNameFake />
          <EmbedModeFake kind="exif" active="optional" />
          <EmbedModeFake kind="watermark" active="optional" />
        </div>
      </Card>
    </Frame>
  );
}

function ReceiverStep5() {
  const { c } = useShot();
  return (
    <Frame slug="receiver-step5" pad="p-10" width={780}>
      <div className="space-y-4">
        <div className="flex items-end justify-between">
          <h1 className="text-[28px] font-bold tracking-[-0.015em] text-ink">
            {c("ギャラリー", "Gallery")}{" "}
            <span className="text-[18px] font-medium text-ink-muted">(6)</span>
          </h1>
          <span className="text-[14px] font-medium text-brand">{c("選択/DL", "Select")}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-sand p-1">
          {[
            { label: c("新着順", "Newest"), active: true },
            { label: c("日付別", "By date"), active: false },
            { label: c("撮影者別", "By photographer"), active: false },
          ].map((t) => (
            <div
              key={t.label}
              className={`flex items-center justify-center rounded-lg py-2 text-[13px] ${
                t.active ? "bg-surface text-ink shadow-card" : "text-ink-soft"
              }`}
            >
              {t.label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {SENDER_NAMES.map((name, i) => (
            <div
              key={name}
              className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-surface-canvas"
            >
              <FakePhoto idx={i} className="h-[82%] w-[82%]" />
              <span className="absolute bottom-1.5 left-1.5 rounded-md bg-ink/55 px-1.5 py-0.5 font-mono text-[10px] text-white">
                {name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

const SHOTS = {
  "sender-step1": SenderStep1,
  "sender-step2": SenderStep2,
  "sender-step3": SenderStep3,
  "sender-step4": SenderStep4,
  "receiver-step1": ReceiverStep1,
  "receiver-step2": ReceiverStep2,
  "receiver-step3": ReceiverStep3,
  "receiver-step4": ReceiverStep4,
  "receiver-step5": ReceiverStep5,
} as const;

type ShotSlug = keyof typeof SHOTS;

/** /__shots → 全カードを縦に並べたインデックス。Playwright は data-shot で個別撮影 */
export function ShotsIndex() {
  return (
    <div className="flex min-h-dvh flex-col items-center gap-10 bg-surface-canvas py-10">
      {(Object.keys(SHOTS) as ShotSlug[]).map((slug) => {
        const C = SHOTS[slug];
        return (
          <div key={slug} className="rounded-3xl bg-surface shadow-modal">
            <C />
          </div>
        );
      })}
    </div>
  );
}

/** /__shots/:slug → 単一カードのみ表示 */
export default function ShotsPage() {
  const { slug } = useParams<{ slug: ShotSlug }>();
  if (!slug || !(slug in SHOTS)) {
    return <ShotsIndex />;
  }
  const C = SHOTS[slug];
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-canvas py-6">
      <C />
    </div>
  );
}
