/**
 * 「使い方ガイド」用スクリーンショットを撮るための、値固定の独立 UI ページ群。
 *
 * - 本番ビルドには絡めない (App.tsx で `import.meta.env.DEV` 条件付き読み込み)
 * - Playwright は `/__shots/:slug` 配下で各カードを一意の `data-shot` セレクタで掴む
 * - 各カードは AppLayout / SenderLayout を経由しないため Footer 干渉なし
 * - スタイルは DESIGN.md & 既存 UI 部品 (Card / Button / StorageQuotaBar) を踏襲
 */

import QRCode from "qrcode";
import { useEffect, useRef } from "react";
import { useParams } from "react-router";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import StorageQuotaBar from "../../components/ui/StorageQuotaBar";

const PUBLIC_HOST = "furdrop.app";
const SAMPLE_HANDLE = "sora_studio";
const SAMPLE_DISPLAY = "そら写真館";

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
          <p className="text-[14px] text-ink-soft">写真を{SAMPLE_DISPLAY}さんに送れます</p>
          <button
            type="button"
            className="block w-full rounded-xl bg-brand px-4 py-3 text-[16px] font-medium text-white"
          >
            写真を送る
          </button>
        </div>
      </div>
    </Frame>
  );
}

function SenderStep2() {
  return (
    <Frame slug="sender-step2" pad="p-8" width={840}>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-lg px-2 py-1 text-[14px] text-ink-soft">&lt; 戻る</span>
          <h1 className="truncate text-[16px] font-semibold text-ink">
            {SAMPLE_DISPLAY}さんへ送信
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
            写真をここにドロップ
          </p>
          <p className="mt-1 text-[14px] text-ink-soft">またはタップしてファイルを選択</p>
          <p className="mt-3 font-mono text-[11px] text-ink-muted">
            JPEG / PNG / HEIC ・ 最大 20MB / 枚 ・ 100 枚まで
          </p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-[14px]">
            <span className="font-medium text-ink">6枚選択中</span>
            <span className="text-ink-soft">すべてクリア</span>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {PHOTO_COLORS.map((c, i) => (
              <div
                key={c}
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
  return (
    <Frame slug="sender-step3" pad="p-10" width={720}>
      <Card>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="sn" className="block text-[14px] font-medium text-ink">
              送信者名 / TwitterID
            </label>
            <input
              id="sn"
              readOnly
              value={SAMPLE_SENDER}
              className="block w-full rounded-xl border border-surface-sand-deep bg-surface px-4 py-3 text-[14px] text-ink"
            />
            <p className="text-[13px] text-ink-soft">
              受信者に表示されます。EXIF・透かしには
              <code className="mx-0.5 rounded bg-surface-sand px-1.5 py-0.5 font-mono text-[0.95em] text-ink">
                撮影：{SAMPLE_SENDER}
              </code>
              の形式で埋め込まれます
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="block text-[13px] font-medium text-ink-soft">クレジット表記</p>
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-sand p-1">
              {[
                { label: "撮影：〜", active: true },
                { label: "Photo by 〜", active: false },
                { label: "© 〜", active: false },
                { label: "名前のみ", active: false },
              ].map((o) => (
                <div
                  key={o.label}
                  className={`flex items-center justify-center rounded-lg px-2 py-1.5 text-center text-[13px] ${
                    o.active ? "bg-surface text-ink shadow-card" : "text-ink-soft"
                  }`}
                >
                  {o.label}
                </div>
              ))}
            </div>
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
                <span className="font-medium text-ink">EXIFカメラモデル欄に埋め込む</span>
                <span className="mt-0.5 block text-[13px] text-ink-soft">
                  メタデータに「撮影：{SAMPLE_SENDER}」を書き込みます（元のカメラ情報は上書き）
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
                  <span className="font-medium text-ink">透かしを入れる</span>
                  <span className="mt-0.5 block text-[13px] text-ink-soft">
                    画像に「撮影：{SAMPLE_SENDER}」を描き込みます（不可逆）
                  </span>
                </span>
              </label>
              <div className="mt-2 pl-6">
                <Button size="sm" variant="secondary">
                  透かしを編集
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
          6枚の写真を送信しました！
        </h1>
        <div className="grid grid-cols-6 gap-2">
          {PHOTO_COLORS.map((c, i) => (
            <div
              key={c}
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
          別の写真を送る
        </button>
      </div>
    </Frame>
  );
}

/* ─────────────────── 受信者 ─────────────────── */

function ReceiverStep1() {
  return (
    <Frame slug="receiver-step1" pad="p-10" width={620}>
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-[28px] font-bold tracking-[-0.015em] text-ink">アカウント設定</h1>
          <p className="mt-2 text-[14px] text-ink-soft">写真を受け取るための公開URLを作成します</p>
        </div>
        <Card>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="h" className="block text-[14px] font-medium text-ink">
                ハンドル
              </label>
              <input
                id="h"
                readOnly
                value={SAMPLE_HANDLE}
                className="block w-full rounded-xl border border-surface-sand-deep bg-surface px-4 py-3 text-[14px] text-ink"
              />
              <p className="text-[13px] text-ink-muted">
                公開URLに使われます: {PUBLIC_HOST}/send/あなたのハンドル
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="dn" className="block text-[14px] font-medium text-ink">
                表示名
              </label>
              <input
                id="dn"
                readOnly
                value={SAMPLE_DISPLAY}
                className="block w-full rounded-xl border border-surface-sand-deep bg-surface px-4 py-3 text-[14px] text-ink"
              />
            </div>
            <div className="space-y-3 border-t border-surface-sand-deep pt-4">
              <p className="text-[14px] font-medium text-ink">受信オプション</p>
              <p className="text-[13px] text-ink-soft">
                送信者に提示するオプションを設定します。あとから設定ページで変更できます。
              </p>
              <EmbedModeFake
                title="EXIF埋め込み"
                desc="送信者がカメラモデル欄に名前を書き込みます（メタデータのみ、除去可能）"
                active="optional"
              />
              <EmbedModeFake
                title="透かし"
                desc="送信者が画像にクレジットテキストを描き込みます（不可逆）"
                active="disabled"
              />
            </div>
            <label className="flex items-start gap-2.5 border-t border-surface-sand-deep pt-4 text-[13px]">
              <input
                type="checkbox"
                checked
                readOnly
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
              />
              <span className="text-ink">
                <span className="text-brand underline-offset-2">利用規約</span>および
                <span className="ml-1 text-brand underline-offset-2">プライバシーポリシー</span>
                に同意します。
              </span>
            </label>
            <button
              type="button"
              className="w-full rounded-xl bg-brand px-5 py-3 text-[16px] font-medium text-white"
            >
              登録する
            </button>
          </div>
        </Card>
      </div>
    </Frame>
  );
}

function EmbedModeFake({
  title,
  desc,
  active,
}: {
  title: string;
  desc: string;
  active: "disabled" | "optional" | "required";
}) {
  const opts: {
    v: "disabled" | "optional" | "required";
    label: string;
    head: string;
    tail: string;
  }[] = [
    { v: "disabled", label: "無効", head: "送信者の", tail: "画面に表示しない" },
    { v: "optional", label: "任意", head: "送信者が", tail: "選択できる" },
    { v: "required", label: "必須", head: "送信者は", tail: "必ず埋め込む" },
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
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) {
      QRCode.toCanvas(ref.current, `https://${PUBLIC_HOST}/send/${SAMPLE_HANDLE}`, {
        width: 200,
        margin: 2,
      });
    }
  }, []);
  return (
    <Frame slug="receiver-step2" pad="p-10" width={620}>
      <Card title="あなたの受信URL">
        <div className="space-y-3">
          <p className="break-all rounded-xl bg-surface-canvas px-3 py-2 font-mono text-[14px] text-ink">
            https://{PUBLIC_HOST}/send/{SAMPLE_HANDLE}
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-xl border border-surface-sand-deep bg-surface-sand px-3 py-2 text-[14px] font-medium text-ink">
              コピー
            </span>
            <span className="rounded-xl border border-surface-sand-deep bg-surface-sand-hover px-3 py-2 text-[14px] font-medium text-ink">
              QR
            </span>
            <span className="rounded-xl border border-surface-sand-deep bg-surface-sand px-3 py-2 text-[14px] font-medium text-ink">
              シェア
            </span>
          </div>
          <div className="flex flex-col items-center gap-3 py-2">
            <canvas ref={ref} className="rounded-xl" />
            <span className="rounded-xl border border-surface-sand-deep bg-surface-sand px-3 py-1.5 text-[13px] font-medium text-ink">
              QRをダウンロード
            </span>
          </div>
        </div>
      </Card>
    </Frame>
  );
}

function ReceiverStep3() {
  return (
    <Frame slug="receiver-step3" pad="p-10" width={620}>
      <Card title="ストレージ">
        <StorageQuotaBar
          used={Math.floor(2.3 * 1024 * 1024 * 1024)}
          quota={10 * 1024 * 1024 * 1024}
        />
      </Card>
    </Frame>
  );
}

function ReceiverStep4() {
  return (
    <Frame slug="receiver-step4" pad="p-10" width={620}>
      <Card title="受信オプション">
        <p className="mb-4 text-[13px] text-ink-soft">
          送信者に提示するオプションを設定します。「必須」にすると送信者は必ず埋め込みます。
        </p>
        <div className="space-y-5">
          <EmbedModeFake
            title="EXIF埋め込み"
            desc="送信者がカメラモデル欄に名前を書き込みます（メタデータのみ、除去可能）"
            active="optional"
          />
          <EmbedModeFake
            title="透かし"
            desc="送信者が画像にクレジットテキストを描き込みます（不可逆）"
            active="optional"
          />
        </div>
      </Card>
    </Frame>
  );
}

function ReceiverStep5() {
  return (
    <Frame slug="receiver-step5" pad="p-10" width={780}>
      <div className="space-y-4">
        <div className="flex items-end justify-between">
          <h1 className="text-[28px] font-bold tracking-[-0.015em] text-ink">
            ギャラリー <span className="text-[18px] font-medium text-ink-muted">(6)</span>
          </h1>
          <span className="text-[14px] font-medium text-brand">選択 / DL</span>
        </div>
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-sand p-1">
          {[
            { label: "新着順", active: true },
            { label: "日付別", active: false },
            { label: "撮影者別", active: false },
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
