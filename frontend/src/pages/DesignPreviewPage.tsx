/**
 * デザインシステム プレビュー (DESIGN.md の生きたカナリア)
 *
 * DESIGN.md を更新した際は必ずこのファイルも同期更新すること。
 * トークン・シャドウ・レイアウト理念の事故変更をここで視覚的に検知する。
 *
 * - 公開はしているが `noindex, nofollow` メタタグで検索結果から除外
 * - 既存コンポーネントには依存させず単体で完結 (他ページと独立)
 */

import { useEffect } from "react";

type ColorChip = {
  name: string;
  hex: string;
  role: string;
  swatchClass: string;
  /** 色が明るい場合は hex テキストを暗色にするためのフラグ */
  light?: boolean;
};

const brandColors: ColorChip[] = [
  {
    name: "Sunset Coral",
    hex: "#D96A4A",
    role: "Primary / CTA / Brand",
    swatchClass: "bg-brand",
  },
  {
    name: "Deep Terracotta",
    hex: "#B8502F",
    role: "Hover / Press",
    swatchClass: "bg-brand-deep",
  },
  {
    name: "Coral Tint",
    hex: "#FCEDE4",
    role: "Selection / Soft bg",
    swatchClass: "bg-brand-tint",
    light: true,
  },
];

const textColors: ColorChip[] = [
  {
    name: "Espresso",
    hex: "#2A1F1B",
    role: "本文 / 見出し",
    swatchClass: "bg-ink",
  },
  {
    name: "Mocha",
    hex: "#6E5F52",
    role: "補助本文 / メタ",
    swatchClass: "bg-ink-soft",
  },
  {
    name: "Warm Silver",
    hex: "#A79A8C",
    role: "無効 / プレースホルダ",
    swatchClass: "bg-ink-muted",
  },
];

const surfaceColors: ColorChip[] = [
  {
    name: "Cream Canvas",
    hex: "#FAF6F0",
    role: "ページ背景",
    swatchClass: "bg-surface-canvas",
    light: true,
  },
  {
    name: "Sand",
    hex: "#F1E8DB",
    role: "セカンダリ面",
    swatchClass: "bg-surface-sand",
    light: true,
  },
  {
    name: "Sand Deep",
    hex: "#EAE1D3",
    role: "ボーダー / 区切り",
    swatchClass: "bg-surface-sand-deep",
    light: true,
  },
];

const statusColors: ColorChip[] = [
  {
    name: "Sage",
    hex: "#4B7A5A",
    role: "成功 / 0–79%",
    swatchClass: "bg-status-success",
  },
  {
    name: "Amber",
    hex: "#D98F2E",
    role: "警告 / 80–94%",
    swatchClass: "bg-status-warn",
  },
  {
    name: "Rust",
    hex: "#A8381F",
    role: "エラー / 95–100%",
    swatchClass: "bg-status-danger",
  },
];

function ColorSwatchGrid({ title, chips }: { title: string; chips: ColorChip[] }) {
  return (
    <div>
      <h3 className="mb-4 text-[18px] font-semibold tracking-[-0.005em] text-ink">{title}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {chips.map((c) => (
          <div
            key={c.hex}
            className="overflow-hidden rounded-2xl border border-surface-sand-deep bg-surface shadow-card"
          >
            <div className={`h-28 ${c.swatchClass}`} />
            <div className="flex flex-col gap-1 p-4">
              <div className="text-[16px] font-semibold text-ink">{c.name}</div>
              <div className="font-mono text-[12px] tracking-[0.01em] text-ink-soft">{c.hex}</div>
              <div className="text-[14px] text-ink-soft">{c.role}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionShell({
  id,
  title,
  caption,
  children,
}: {
  id: string;
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      <div className="mb-8 space-y-2">
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-brand">
          {id}
        </div>
        <h2 className="text-[28px] font-bold leading-tight tracking-[-0.015em] text-ink">
          {title}
        </h2>
        <p className="max-w-3xl text-[16px] leading-[1.5] text-ink-soft">{caption}</p>
      </div>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 1. Colors                                                                  */
/* -------------------------------------------------------------------------- */

function ColorsSection() {
  return (
    <SectionShell
      id="01"
      title="カラーパレット"
      caption="ブランド・ニュートラル・セマンティックの3群で管理。Sunset Coral は CTA とブランドにのみ、本文は Espresso を徹底する。"
    >
      <div className="space-y-10">
        <ColorSwatchGrid title="Primary Brand" chips={brandColors} />
        <ColorSwatchGrid title="Text Scale" chips={textColors} />
        <ColorSwatchGrid title="Surface & Border" chips={surfaceColors} />
        <ColorSwatchGrid title="Semantic" chips={statusColors} />
      </div>
    </SectionShell>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Typography                                                              */
/* -------------------------------------------------------------------------- */

function TypographySection() {
  const sample = "こんにちは、FurDrop — @taro_camera";
  // sampleClass は実際のレスポンシブ挙動を視覚化するため responsive prefix 付きで定義
  const rows: { role: string; sampleClass: string; meta: string; scaled: boolean }[] = [
    {
      role: "Display Hero",
      sampleClass:
        "text-[28px] sm:text-[40px] font-bold leading-[1.15] tracking-[-0.02em] text-ink",
      meta: "mobile 28px / sm+ 40px / 700 / -0.02em",
      scaled: true,
    },
    {
      role: "Page Title",
      sampleClass:
        "text-[22px] sm:text-[28px] font-bold leading-[1.25] tracking-[-0.015em] text-ink",
      meta: "mobile 22px / sm+ 28px / 700 / -0.015em",
      scaled: true,
    },
    {
      role: "Section Heading",
      sampleClass: "text-[22px] font-semibold leading-[1.30] tracking-[-0.01em] text-ink",
      meta: "22px / 600 / -0.01em",
      scaled: false,
    },
    {
      role: "Card Title",
      sampleClass: "text-[18px] font-semibold leading-[1.35] tracking-[-0.005em] text-ink",
      meta: "18px / 600 / -0.005em",
      scaled: false,
    },
    {
      role: "Body Emphasis",
      sampleClass: "text-[16px] font-medium leading-[1.5] text-ink",
      meta: "16px / 500",
      scaled: false,
    },
    {
      role: "Body",
      sampleClass: "text-[16px] font-normal leading-[1.5] text-ink",
      meta: "16px / 400",
      scaled: false,
    },
    {
      role: "UI Label",
      sampleClass: "text-[14px] font-medium leading-[1.4] text-ink",
      meta: "14px / 500",
      scaled: false,
    },
    {
      role: "Meta",
      sampleClass: "text-[14px] font-normal leading-[1.45] text-ink-soft",
      meta: "14px / 400 / Mocha",
      scaled: false,
    },
    {
      role: "Caption",
      sampleClass: "text-[12px] font-normal leading-[1.4] tracking-[0.01em] text-ink-soft",
      meta: "12px / 400 / 0.01em",
      scaled: false,
    },
    {
      role: "Micro Upper",
      sampleClass: "text-[11px] font-bold uppercase leading-[1.3] tracking-[0.08em] text-brand",
      meta: "11px / 700 / 0.08em",
      scaled: false,
    },
  ];

  return (
    <SectionShell
      id="02"
      title="タイポグラフィ"
      caption="Inter + Noto Sans JP の2段ファミリー。見出しには負トラッキング、ウェイトは 400/500/600/700 のみ。Display Hero と Page Title のみモバイルで縮小 (sm+ で元サイズに戻す)。"
    >
      <div className="overflow-hidden rounded-[20px] border border-surface-sand-deep bg-surface shadow-card">
        {rows.map((row, idx) => (
          <div
            key={row.role}
            className={`flex flex-col gap-2 p-6 sm:flex-row sm:items-baseline sm:justify-between ${
              idx > 0 ? "border-t border-surface-sand-deep" : ""
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
                  {row.role}
                </div>
                {row.scaled && (
                  <span className="rounded-full bg-brand-tint px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-brand-deep">
                    mobile scaled
                  </span>
                )}
              </div>
              <div className={row.sampleClass}>{sample}</div>
            </div>
            <div className="font-mono text-[12px] text-ink-muted">{row.meta}</div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[13px] text-ink-soft">
        ※ Display Hero / Page Title は幅 640px 未満で縮小。Section Heading 以下は
        a11y・操作性・情報密度のため モバイルでもサイズ据え置き
        (ギャラリーのグループヘッダー・選択/DL ボタンなどはこれらに該当)。
      </p>
    </SectionShell>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Buttons                                                                 */
/* -------------------------------------------------------------------------- */

function ButtonsSection() {
  return (
    <SectionShell
      id="03"
      title="ボタン"
      caption="Primary は Sunset Coral の単独アクセント。Secondary は Sand、Ghost は透明、Circular は Airbnb流の円形コントロール。"
    >
      <div className="rounded-[20px] border border-surface-sand-deep bg-surface p-8 shadow-card">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Primary */}
          <div className="space-y-3">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
              Primary
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-[12px] bg-brand px-5 py-3 text-[14px] font-medium text-white transition hover:bg-brand-deep hover:shadow-card-hover active:scale-[0.98]"
              >
                写真を送る
              </button>
              <button
                type="button"
                className="rounded-[16px] bg-brand px-6 py-3.5 text-[16px] font-medium text-white transition hover:bg-brand-deep hover:shadow-card-hover active:scale-[0.98]"
              >
                送信する (6枚)
              </button>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-[12px] bg-brand px-5 py-3 text-[14px] font-medium text-white opacity-40"
              >
                Disabled
              </button>
            </div>
          </div>

          {/* Secondary */}
          <div className="space-y-3">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
              Secondary (Sand)
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-[12px] border border-surface-sand-deep bg-surface-sand px-5 py-3 text-[14px] font-medium text-ink transition hover:bg-surface-sand-hover"
              >
                コピー
              </button>
              <button
                type="button"
                className="rounded-[12px] border border-surface-sand-deep bg-surface-sand px-5 py-3 text-[14px] font-medium text-ink transition hover:bg-surface-sand-hover"
              >
                QR表示
              </button>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-[12px] border border-surface-sand-deep bg-surface-sand px-5 py-3 text-[14px] font-medium text-ink opacity-40"
              >
                Disabled
              </button>
            </div>
          </div>

          {/* Ghost */}
          <div className="space-y-3">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
              Ghost / Text
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-[14px] font-medium text-ink-soft transition hover:bg-surface-sand"
              >
                ログアウト
              </button>
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-[14px] font-medium text-brand transition hover:bg-surface-sand"
              >
                全て見る
              </button>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-lg px-3 py-2 text-[14px] font-medium text-ink-muted opacity-60"
              >
                Disabled
              </button>
            </div>
          </div>

          {/* Circular */}
          <div className="space-y-3">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
              Circular Control
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                aria-label="前へ"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-surface-sand-deep bg-surface text-ink transition hover:shadow-card-hover"
              >
                ←
              </button>
              <button
                type="button"
                aria-label="次へ"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-surface-sand-deep bg-surface text-ink transition hover:shadow-card-hover"
              >
                →
              </button>
              <button
                type="button"
                aria-label="閉じる"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-surface-sand-deep bg-surface text-ink transition hover:shadow-card-hover"
              >
                ×
              </button>
            </div>
          </div>

          {/* Destructive */}
          <div className="space-y-3 md:col-span-2">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
              Destructive
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-[12px] bg-status-danger px-5 py-3 text-[14px] font-medium text-white transition hover:opacity-90 active:scale-[0.98]"
              >
                削除する
              </button>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-[12px] bg-status-danger px-5 py-3 text-[14px] font-medium text-white opacity-40"
              >
                Disabled
              </button>
            </div>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Cards                                                                   */
/* -------------------------------------------------------------------------- */

function CardsSection() {
  return (
    <SectionShell
      id="04"
      title="カード"
      caption="Photo Card はフラット (写真が深度)。Receiver Card は三層シャドウ。Modal は強めの下方シャドウ。"
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Photo Card (flat, 均一正方形, contain) */}
        <div>
          <div className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
            Photo Card (square · contain)
          </div>
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[16px] bg-surface-canvas">
            <img
              src="https://picsum.photos/seed/photocard/600/800"
              alt="サンプル (縦長)"
              className="max-h-full max-w-full rounded-[12px] object-contain"
            />
          </div>
          <p className="mt-2 text-[12px] text-ink-soft">
            正方形枠 · radius 16px · shadow なし · object-contain で写真全体を表示
          </p>
        </div>

        {/* Receiver Card (三層シャドウ) */}
        <div>
          <div className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
            Receiver Card
          </div>
          <div className="rounded-[20px] bg-surface p-6 shadow-card transition hover:shadow-card-hover">
            <div className="mb-4 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-surface-canvas shadow-card">
                <img
                  src="https://picsum.photos/seed/avatar/120/120"
                  alt="avatar"
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <div className="text-[18px] font-semibold tracking-[-0.005em] text-ink">
                  太郎カメラ
                </div>
                <div className="font-mono text-[14px] text-ink-soft">/send/taro_camera</div>
              </div>
            </div>
            <p className="text-[14px] leading-[1.5] text-ink-soft">
              写真を太郎カメラさんに送れます。JPEG/PNG/HEIC に対応。
            </p>
            <button
              type="button"
              className="mt-5 w-full rounded-[12px] bg-brand py-3 text-[14px] font-medium text-white transition hover:bg-brand-deep active:scale-[0.98]"
            >
              写真を送る
            </button>
          </div>
          <p className="mt-2 text-[12px] text-ink-soft">
            radius 20px・三層シャドウ・ホバーで強いリフト
          </p>
        </div>

        {/* Modal */}
        <div>
          <div className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
            Modal
          </div>
          <div className="rounded-[24px] bg-surface p-6 shadow-modal">
            <div className="text-[18px] font-semibold tracking-[-0.005em] text-ink">
              この写真を削除しますか？
            </div>
            <p className="mt-2 text-[14px] leading-[1.5] text-ink-soft">
              削除した写真は元に戻せません。ストレージ使用量は即座に反映されます。
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-[12px] border border-surface-sand-deep bg-surface-sand px-4 py-2.5 text-[14px] font-medium text-ink hover:bg-surface-sand-hover"
              >
                キャンセル
              </button>
              <button
                type="button"
                className="rounded-[12px] bg-status-danger px-4 py-2.5 text-[14px] font-medium text-white hover:opacity-90"
              >
                削除する
              </button>
            </div>
          </div>
          <p className="mt-2 text-[12px] text-ink-soft">radius 24px・Modal シャドウ</p>
        </div>
      </div>
    </SectionShell>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. Inputs                                                                  */
/* -------------------------------------------------------------------------- */

function InputsSection() {
  const baseInput =
    "w-full rounded-[12px] border bg-surface px-4 py-3 text-[16px] text-ink placeholder:text-ink-muted outline-none transition";

  return (
    <SectionShell
      id="05"
      title="入力フォーム"
      caption="border は Sand Deep、focus で Coral ring。Error は Rust ring。Disabled は Sand 塗り。"
    >
      <div className="rounded-[20px] border border-surface-sand-deep bg-surface p-8 shadow-card">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-[14px] font-medium text-ink">通常</span>
            <input
              type="text"
              placeholder="@hanako_photo"
              className={`${baseInput} border-surface-sand-deep focus:border-brand focus:ring-[3px] focus:ring-brand/20`}
            />
            <span className="text-[12px] text-ink-soft">
              border: Sand Deep / placeholder: Warm Silver
            </span>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-[14px] font-medium text-ink">フォーカス (自動適用)</span>
            <input
              type="text"
              defaultValue="@taro_camera"
              className={`${baseInput} border-brand shadow-[0_0_0_3px_rgba(217,106,74,0.15)]`}
            />
            <span className="text-[12px] text-ink-soft">border: Coral / ring: Coral 15%</span>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-[14px] font-medium text-status-danger">エラー</span>
            <input
              type="text"
              defaultValue="ab"
              aria-invalid
              className={`${baseInput} border-status-danger shadow-[0_0_0_3px_rgba(168,56,31,0.15)]`}
            />
            <span className="text-[12px] text-status-danger">
              スラッグは 3 文字以上の英数字にしてください
            </span>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-[14px] font-medium text-ink-muted">Disabled</span>
            <input
              type="text"
              disabled
              defaultValue="編集不可"
              className={`${baseInput} cursor-not-allowed border-surface-sand-deep bg-surface-sand text-ink-muted`}
            />
            <span className="text-[12px] text-ink-soft">bg: Sand / text: Warm Silver</span>
          </label>
        </div>
      </div>
    </SectionShell>
  );
}

/* -------------------------------------------------------------------------- */
/* 6. Quota Bars                                                              */
/* -------------------------------------------------------------------------- */

function QuotaSection() {
  const bars: { pct: number; label: string; color: string; token: string }[] = [
    { pct: 40, label: "4.0GB / 10GB", color: "bg-status-success", token: "Sage (0–79%)" },
    { pct: 85, label: "8.5GB / 10GB", color: "bg-status-warn", token: "Amber (80–94%)" },
    { pct: 97, label: "9.7GB / 10GB", color: "bg-status-danger", token: "Rust (95–100%)" },
  ];

  return (
    <SectionShell
      id="06"
      title="ストレージバー (Quota)"
      caption="使用率に応じて Sage / Amber / Rust を動的に切り替える。トラックは Sand、fullly rounded。"
    >
      <div className="rounded-[20px] border border-surface-sand-deep bg-surface p-8 shadow-card">
        <div className="space-y-6">
          {bars.map((bar) => (
            <div key={bar.pct} className="space-y-2">
              <div className="flex items-baseline justify-between">
                <div className="text-[14px] font-medium text-ink">{bar.label}</div>
                <div className="font-mono text-[12px] text-ink-soft">
                  {bar.token} — {bar.pct}%
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sand">
                <div
                  className={`h-full rounded-full ${bar.color} transition-[width] duration-300`}
                  style={{ width: `${bar.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}

/* -------------------------------------------------------------------------- */
/* 7. Badges                                                                  */
/* -------------------------------------------------------------------------- */

function BadgesSection() {
  return (
    <SectionShell
      id="07"
      title="バッジ"
      caption="Coral Tint 系はブランド文脈、Sand 系は中立的なメタ情報。いずれも pill 形状・12px 600。"
    >
      <div className="rounded-[20px] border border-surface-sand-deep bg-surface p-8 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-brand-tint px-2.5 py-1 text-[12px] font-semibold text-brand-deep">
            NEW
          </span>
          <span className="rounded-full bg-brand-tint px-2.5 py-1 text-[12px] font-semibold text-brand-deep">
            EXIF埋め込み
          </span>
          <span className="rounded-full bg-brand-tint px-2.5 py-1 text-[12px] font-semibold text-brand-deep">
            透かし OK
          </span>
          <span className="rounded-full bg-surface-sand px-2.5 py-1 text-[12px] font-semibold text-ink-soft">
            完了
          </span>
          <span className="rounded-full bg-surface-sand px-2.5 py-1 text-[12px] font-semibold text-ink-soft">
            待機
          </span>
          <span className="rounded-full bg-surface-sand px-2.5 py-1 text-[12px] font-semibold text-ink-soft">
            JPEG
          </span>
          <span className="rounded-full bg-status-success-tint px-2.5 py-1 text-[12px] font-semibold text-status-success">
            アップロード済み
          </span>
          <span className="rounded-full bg-status-danger-tint px-2.5 py-1 text-[12px] font-semibold text-status-danger">
            失敗
          </span>
        </div>
      </div>
    </SectionShell>
  );
}

/* -------------------------------------------------------------------------- */
/* 8. Drop Zone                                                               */
/* -------------------------------------------------------------------------- */

function DropZoneSection() {
  return (
    <SectionShell
      id="08"
      title="Drop Zone"
      caption="S02 アップロード画面のヒーロー。通常時は Cream + 破線ボーダー、ドラッグオーバー時は Coral Tint + Coral 破線。"
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <div className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
            通常
          </div>
          <div className="flex flex-col items-center justify-center rounded-[20px] border-2 border-dashed border-surface-sand-deep bg-surface-canvas px-6 py-12 text-center">
            <div className="mb-3 text-[32px]">📷</div>
            <div className="text-[16px] font-medium text-ink">ここにドラッグ&ドロップ</div>
            <div className="mt-1 text-[14px] text-ink-soft">
              またはタップして選択 (JPEG / PNG / HEIC, 最大 20MB/枚)
            </div>
          </div>
        </div>

        <div>
          <div className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
            Dragover (active)
          </div>
          <div className="flex flex-col items-center justify-center rounded-[20px] border-2 border-dashed border-brand bg-brand-tint px-6 py-12 text-center">
            <div className="mb-3 text-[32px]">✨</div>
            <div className="text-[16px] font-medium text-ink">ここで離すと追加されます</div>
            <div className="mt-1 text-[14px] text-ink-soft">6 枚のファイルを検出</div>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

/* -------------------------------------------------------------------------- */
/* 9. Gallery — 均一グリッド (masonry 非採用)                                   */
/* -------------------------------------------------------------------------- */

function GallerySection() {
  // [width, height] — さまざまな縦横比をテストするための混在データ
  const photos: [number, number][] = [
    [400, 600], // 縦長
    [600, 400], // 横長
    [400, 400], // 正方形
    [400, 700], // 細長い縦
    [800, 400], // 幅広
    [500, 500], // 正方形
    [400, 550], // 縦長
    [700, 400], // 横長
    [400, 400], // 正方形
    [400, 650], // 縦長
    [650, 400], // 横長
    [400, 400], // 正方形
  ];

  return (
    <SectionShell
      id="09"
      title="ギャラリー (均一グリッド · 正方形)"
      caption="全カード aspect-ratio 1/1 の均一グリッド。写真は object-contain で全体を表示し、余白は Cream 台座で吸収。masonry は採用しない — 格子状の整列で DL 選択の UX を最優先。"
    >
      <div className="rounded-[20px] border border-surface-sand-deep bg-surface p-4 shadow-card sm:p-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
          {photos.map(([w, h], i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: 静的プレビュー用の固定配列
              key={i}
              className="group relative flex aspect-square items-center justify-center overflow-hidden rounded-[16px] bg-surface-canvas transition hover:scale-[1.02]"
            >
              <img
                src={`https://picsum.photos/seed/furdrop-${i}/${w}/${h}`}
                alt={`sample ${i}`}
                className="max-h-full max-w-full rounded-[12px] object-contain"
                loading="lazy"
              />
              {/* 選択モードのチェックボックス (全カード同一位置) */}
              <div className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border border-surface-sand-deep bg-white/90 shadow-sm opacity-0 transition group-hover:opacity-100" />
            </div>
          ))}
        </div>
        <p className="mt-4 text-center font-mono text-[11px] text-ink-muted">
          縦長 → 左右が Cream で埋まる / 横長 → 上下が Cream で埋まる / 正方形 → 枠いっぱい
        </p>
      </div>
    </SectionShell>
  );
}

/* -------------------------------------------------------------------------- */
/* 10. Mobile Header (hamburger)                                              */
/* -------------------------------------------------------------------------- */

function MobileHeaderSection() {
  return (
    <SectionShell
      id="10"
      title="モバイルヘッダー (ハンバーガー)"
      caption="sm 未満では NavLink を横並びにせず、ハンバーガーボタン + ドロワーに集約する。ロゴが押しつぶされ改行が発生する NG パターンと、正しいハンバーガー展開を並記する。"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* NG: メニュー横並びで押しつぶし・改行 */}
        <div className="rounded-[20px] border border-status-danger/30 bg-status-danger-tint/40 p-5">
          <div className="mb-3 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-status-danger">
            Don&rsquo;t
          </div>
          <div className="mx-auto w-[360px] max-w-full overflow-hidden rounded-[16px] border border-surface-sand-deep bg-surface shadow-card">
            <div className="flex h-14 items-center justify-between gap-2 border-b border-surface-sand-deep bg-surface/85 px-4 backdrop-blur">
              <div className="flex min-w-0 items-center">
                <div className="h-6 min-w-0 flex-1 truncate font-semibold text-brand">FurDrop</div>
              </div>
              <nav className="flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
                <span>ダッシュボード</span>
                <span>ギャラリー</span>
                <span>設定</span>
                <span>ログアウト</span>
              </nav>
            </div>
            <div className="flex h-24 items-center justify-center bg-surface-canvas text-[12px] text-ink-muted">
              Content
            </div>
          </div>
          <p className="mt-3 text-[13px] text-status-danger">
            日本語メニューを横並びにすると、ロゴが縦に伸び / メニューが改行し / タップ領域が 44px
            未満になる。
          </p>
        </div>

        {/* Do: ハンバーガー + ドロワー */}
        <div className="rounded-[20px] border border-status-success/30 bg-status-success-tint/40 p-5">
          <div className="mb-3 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-status-success">
            Do
          </div>
          <div className="mx-auto w-[360px] max-w-full overflow-hidden rounded-[16px] border border-surface-sand-deep bg-surface shadow-card">
            <div className="flex h-14 items-center justify-between gap-3 border-b border-surface-sand-deep bg-surface/85 px-4 backdrop-blur">
              <div className="flex shrink-0 items-center font-semibold text-brand">FurDrop</div>
              <button
                type="button"
                aria-label="メニューを開く"
                className="flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-surface-sand"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  role="img"
                  aria-hidden="true"
                >
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            </div>
            <div className="border-b border-surface-sand-deep bg-surface shadow-card">
              <nav className="flex flex-col gap-1 px-4 py-3">
                <div className="rounded-xl bg-brand-tint px-4 py-3 text-[16px] font-semibold text-brand">
                  ダッシュボード
                </div>
                <div className="rounded-xl px-4 py-3 text-[16px] font-medium text-ink">
                  ギャラリー
                </div>
                <div className="rounded-xl px-4 py-3 text-[16px] font-medium text-ink">設定</div>
                <div className="mt-1 rounded-xl px-4 py-3 text-[14px] font-medium text-ink-soft">
                  ログアウト
                </div>
              </nav>
            </div>
            <div className="flex h-20 items-center justify-center bg-ink/40 text-[12px] text-white">
              Backdrop (ink/40)
            </div>
          </div>
          <p className="mt-3 text-[13px] text-status-success">
            ロゴ <code className="font-mono">shrink-0</code> で縮みを禁止。右端に円形 44×44
            のハンバーガー。展開ドロワーは active に{" "}
            <code className="font-mono">bg-brand-tint</code>
            、各行 tap target 44px 以上。
          </p>
        </div>
      </div>
    </SectionShell>
  );
}

/* -------------------------------------------------------------------------- */
/* 11. Detail Viewer (aspect-ratio preservation)                              */
/* -------------------------------------------------------------------------- */

function DetailViewerSection() {
  const samples: { label: string; w: number; h: number }[] = [
    { label: "横長 3:2", w: 600, h: 400 },
    { label: "正方形 1:1", w: 500, h: 500 },
    { label: "縦長 2:3", w: 400, h: 600 },
    { label: "パノラマ 2:1", w: 800, h: 400 },
  ];

  return (
    <SectionShell
      id="11"
      title="詳細画像ビューア (アスペクト比保持)"
      caption="S08 詳細画像は width: min(100%, 70vh * ratio) + aspect-ratio で縦辺を 70vh 以下に抑えつつアスペクト比を必ず保持する。固定 height + aspect-ratio + max-width の併用は禁止 (モバイル幅 clamp でアスペクト比が崩れるため)。"
    >
      <div className="grid gap-6 sm:grid-cols-2">
        {samples.map((s) => {
          const ratio = s.w / s.h;
          return (
            <div
              key={s.label}
              className="rounded-[20px] border border-surface-sand-deep bg-surface p-4 shadow-card sm:p-6"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[14px] font-semibold text-ink">{s.label}</span>
                <span className="font-mono text-[11px] text-ink-muted">
                  {s.w} × {s.h} (ratio {ratio.toFixed(2)})
                </span>
              </div>
              <div className="flex justify-center">
                <div
                  className="relative overflow-hidden rounded-2xl bg-surface-canvas"
                  style={{
                    aspectRatio: `${s.w} / ${s.h}`,
                    width: `min(100%, calc(40vh * ${ratio}))`,
                  }}
                >
                  <img
                    src={`https://picsum.photos/seed/furdrop-detail-${s.w}x${s.h}/${s.w}/${s.h}`}
                    alt={s.label}
                    className="absolute inset-0 h-full w-full object-contain"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="mt-3 font-mono text-[11px] leading-[1.5] text-ink-muted">
                aspectRatio: {s.w} / {s.h}
                <br />
                width: min(100%, calc(40vh * {ratio.toFixed(2)}))
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-[13px] text-ink-soft">
        ※ プレビューは 40vh で縮小表示。本番 (S08) では 70vh
        を上限に。横長・パノラマはコンテナ幅が親幅に clamp され、縦長はコンテナ幅が計算値に clamp
        されて縦辺が 70vh を超えない。
      </p>
    </SectionShell>
  );
}

/* -------------------------------------------------------------------------- */
/* 11b. Destructive Confirm Dialog                                            */
/* -------------------------------------------------------------------------- */

function ConfirmDialogSection() {
  return (
    <SectionShell
      id="11b"
      title="Destructive Confirm Dialog"
      caption="取り消し不可の操作は ConfirmDialog (variant=danger) を必ず挟む。native window.confirm() は使わない。title は疑問形、confirmLabel は動詞 + する (例: 削除する / ログアウト)。"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Delete sample */}
        <div className="rounded-[20px] border border-surface-sand-deep bg-surface-canvas p-6">
          <div className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
            例: 写真を削除
          </div>
          <div className="relative overflow-hidden rounded-[20px] bg-ink/40 p-6 backdrop-blur-sm">
            <div className="mx-auto w-full max-w-lg overflow-hidden rounded-[20px] bg-surface shadow-modal">
              <div className="flex items-center justify-between border-b border-surface-sand-deep px-5 py-3.5">
                <div className="text-[16px] font-semibold text-ink">3枚の写真を削除しますか？</div>
                <div className="text-[20px] leading-none text-ink-muted">×</div>
              </div>
              <div className="p-5 text-[14px] leading-[1.6] text-ink">
                削除された写真は復元できません。
              </div>
              <div className="flex justify-end gap-2 border-t border-surface-sand-deep px-5 py-3.5">
                <div className="rounded-xl border border-surface-sand-deep bg-surface-sand px-4 py-2.5 text-[14px] font-medium text-ink">
                  キャンセル
                </div>
                <div className="rounded-xl bg-status-danger px-4 py-2.5 text-[14px] font-medium text-white">
                  削除する
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Logout sample */}
        <div className="rounded-[20px] border border-surface-sand-deep bg-surface-canvas p-6">
          <div className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted">
            例: ログアウト
          </div>
          <div className="relative overflow-hidden rounded-[20px] bg-ink/40 p-6 backdrop-blur-sm">
            <div className="mx-auto w-full max-w-lg overflow-hidden rounded-[20px] bg-surface shadow-modal">
              <div className="flex items-center justify-between border-b border-surface-sand-deep px-5 py-3.5">
                <div className="text-[16px] font-semibold text-ink">ログアウトしますか？</div>
                <div className="text-[20px] leading-none text-ink-muted">×</div>
              </div>
              <div className="p-5 text-[14px] leading-[1.6] text-ink">
                再度ログインするには Twitter 認証が必要です。
              </div>
              <div className="flex justify-end gap-2 border-t border-surface-sand-deep px-5 py-3.5">
                <div className="rounded-xl border border-surface-sand-deep bg-surface-sand px-4 py-2.5 text-[14px] font-medium text-ink">
                  キャンセル
                </div>
                <div className="rounded-xl bg-status-danger px-4 py-2.5 text-[14px] font-medium text-white">
                  ログアウト
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-[16px] border border-status-danger/30 bg-status-danger-tint/40 p-5">
        <div className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-status-danger">
          Don&rsquo;t
        </div>
        <p className="text-[14px] leading-[1.6] text-ink">
          <code className="font-mono text-[13px]">window.confirm("削除しますか？")</code> のような
          native confirm
          を使わない。ブラウザ標準スタイルはブランドと合わず、日本語の改行も不自然になる。
        </p>
      </div>
    </SectionShell>
  );
}

/* -------------------------------------------------------------------------- */
/* 12. Depth levels                                                           */
/* -------------------------------------------------------------------------- */

function DepthSection() {
  const levels: { name: string; shadowClass: string; desc: string }[] = [
    {
      name: "Flat (0)",
      shadowClass: "",
      desc: "ページ背景・本文・ギャラリーサムネイル",
    },
    {
      name: "Card (1)",
      shadowClass: "shadow-card",
      desc: "Dashboard カード、受信者プロフィールカード",
    },
    {
      name: "Hover (2)",
      shadowClass: "shadow-card-hover",
      desc: "ボタンホバー・カードホバー",
    },
    {
      name: "Modal (3)",
      shadowClass: "shadow-modal",
      desc: "モーダル・ドロワー",
    },
  ];

  return (
    <SectionShell
      id="12"
      title="影レベル"
      caption="三層シャドウをカードに採用。ギャラリーサムネイルは意図的にフラット。opacity > 0.15 を主層にしない。"
    >
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {levels.map((l) => (
          <div key={l.name} className="flex flex-col items-center">
            <div
              className={`h-32 w-full rounded-[20px] border border-surface-sand-deep bg-surface ${l.shadowClass}`}
            />
            <div className="mt-4 text-[16px] font-semibold text-ink">{l.name}</div>
            <div className="mt-1 text-center text-[12px] text-ink-soft">{l.desc}</div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

/* -------------------------------------------------------------------------- */
/* Preview Banner & Maintenance Guide                                         */
/* -------------------------------------------------------------------------- */

function PreviewBanner() {
  return (
    <div className="sticky top-0 z-10 border-b border-brand-tint bg-brand-tint/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-brand-deep">
          Preview
        </span>
        <div className="text-[14px] font-medium text-brand-deep">
          DESIGN.md の生きたカナリア — noindex 設定済み
        </div>
      </div>
    </div>
  );
}

function MaintenanceGuide() {
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      <div className="rounded-[20px] border border-surface-sand-deep bg-surface p-6 shadow-card">
        <div className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-brand">
          Maintenance
        </div>
        <h3 className="text-[22px] font-semibold tracking-[-0.01em] text-ink">
          このページのメンテナンス
        </h3>
        <ul className="mt-4 space-y-2 text-[16px] text-ink">
          <li>
            <span className="mr-2 font-semibold text-brand-deep">・</span>
            <code className="font-mono text-[14px] text-ink-soft">DESIGN.md</code>{" "}
            を更新した際は、このファイル{" "}
            <code className="font-mono text-[14px] text-ink-soft">
              frontend/src/pages/DesignPreviewPage.tsx
            </code>{" "}
            も同期更新すること
          </li>
          <li>
            <span className="mr-2 font-semibold text-brand-deep">・</span>
            カラートークンやシャドウの事故変更をここで視覚的に検知するため、乖離させない
          </li>
          <li>
            <span className="mr-2 font-semibold text-brand-deep">・</span>
            検索エンジンには{" "}
            <code className="font-mono text-[14px] text-ink-soft">noindex, nofollow</code>{" "}
            で除外済み。ナビからリンクは貼らない
          </li>
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

function useNoindex() {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);
}

export default function DesignPreviewPage() {
  useNoindex();
  return (
    <div className="min-h-dvh bg-surface-canvas text-ink antialiased">
      <PreviewBanner />

      <header className="mx-auto max-w-6xl px-4 pt-16 pb-8 sm:px-6 lg:px-8">
        <div className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-brand">
          FurDrop Design System
        </div>
        <h1 className="mt-3 text-[40px] font-bold leading-[1.15] tracking-[-0.02em] text-ink sm:text-[48px]">
          デザインシステム プレビュー
        </h1>
        <p className="mt-4 max-w-3xl text-[16px] leading-[1.5] text-ink-soft">
          <code className="font-mono text-[14px]">DESIGN.md</code>{" "}
          に定義したカラー・タイポグラフィ・コンポーネントを一望するための確認用ページです。 Airbnb
          由来の三層シャドウと Pinterest 由来の暖色ニュートラルを Sunset Coral
          パレットで統合。ギャラリーは masonry
          ではなく均一グリッドを採用し、写真は必ず全体を表示します。
        </p>
      </header>

      <main className="space-y-20 pb-24">
        <ColorsSection />
        <TypographySection />
        <ButtonsSection />
        <CardsSection />
        <InputsSection />
        <QuotaSection />
        <BadgesSection />
        <DropZoneSection />
        <GallerySection />
        <MobileHeaderSection />
        <DetailViewerSection />
        <ConfirmDialogSection />
        <DepthSection />
        <MaintenanceGuide />
      </main>
    </div>
  );
}
