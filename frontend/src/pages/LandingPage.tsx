import { useAtomValue } from "jotai";
import type { CSSProperties } from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import logoUrl from "../assets/logos/logo.png";
import { authAtom } from "../stores/auth";

const FEEDBACK_URL = import.meta.env.VITE_FEEDBACK_URL ?? "";
const PUBLIC_HOST = import.meta.env.VITE_PUBLIC_HOST ?? "furdrop.app";
const SAMPLE_HANDLE = "photographer";
const SAMPLE_RECEIVE_URL = `${PUBLIC_HOST}/send/${SAMPLE_HANDLE}`;

const CAVEAT = "'Caveat', cursive";
const MONO = "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

function LogoMark({ size = 28 }: { size?: number }) {
  return <img src={logoUrl} alt="FurDrop" className="w-auto shrink-0" style={{ height: size }} />;
}

function PolaroidPhoto({
  filename,
  rotation,
  width,
  height,
  gradientAngle,
  position,
}: {
  filename: string;
  rotation: number;
  width: number;
  height: number;
  gradientAngle: number;
  position: CSSProperties;
}) {
  return (
    <div className="absolute" style={position}>
      <div
        className="bg-white px-3 pt-3 pb-9 shadow-[0_8px_22px_rgba(42,31,27,0.12)]"
        style={{
          width,
          transform: `rotate(${rotation}deg)`,
        }}
      >
        <div
          className="relative w-full overflow-hidden rounded-md border border-[#e0d6c5]"
          style={{
            height,
            background: `repeating-linear-gradient(${gradientAngle}deg, transparent 0, transparent 7px, rgba(42,31,27,0.05) 7px, rgba(42,31,27,0.05) 8px) #f1e8db`,
          }}
        >
          <div
            className="absolute inset-0 flex items-center justify-center text-[10px] tracking-[0.06em] text-[#a79a8c]"
            style={{ fontFamily: MONO }}
          >
            {filename}
          </div>
        </div>
        <div
          className="mt-[10px] text-center text-[16px] text-[#6e5f52]"
          style={{ fontFamily: CAVEAT }}
        >
          {filename}
        </div>
      </div>
    </div>
  );
}

function HandleInputBox({ onSubmit }: { onSubmit: () => void }) {
  const [handle, setHandle] = useState("");
  return (
    <div className="flex max-w-[560px] flex-wrap items-center rounded-2xl border-[1.5px] border-[#b8ac97] bg-white p-1.5 shadow-[0_6px_18px_rgba(42,31,27,0.08)] md:flex-nowrap">
      <span
        className="whitespace-nowrap py-3.5 pl-4 pr-1 text-[14px] text-[#a79a8c]"
        style={{ fontFamily: MONO }}
      >
        {PUBLIC_HOST}/send/
      </span>
      <input
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        placeholder="your_handle"
        className="min-w-0 flex-1 border-none bg-transparent py-3.5 text-[14px] font-semibold text-ink outline-none"
        style={{ fontFamily: MONO }}
      />
      <button
        type="button"
        onClick={onSubmit}
        className="mt-1.5 w-full cursor-pointer whitespace-nowrap rounded-xl border-none bg-brand px-[22px] py-3.5 text-[14px] font-semibold text-white md:mt-0 md:w-auto"
      >
        URLを作る →
      </button>
    </div>
  );
}

function SectionKicker({ label, align = "left" }: { label: string; align?: "left" | "center" }) {
  return (
    <div
      className={`mb-4 flex items-center gap-2.5 ${
        align === "center" ? "justify-center" : "justify-start"
      }`}
    >
      <span className="h-[7px] w-[7px] shrink-0 rotate-45 bg-brand" aria-hidden="true" />
      <span className="text-[13px] font-semibold tracking-[0.02em] text-brand">{label}</span>
    </div>
  );
}

function ArrowRight() {
  return (
    <svg width={24} height={14} viewBox="0 0 24 14" aria-hidden="true" focusable="false">
      <title>arrow</title>
      <path
        d="M 1 7 L 22 7 M 17 2 L 22 7 L 17 12"
        stroke="#a79a8c"
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FlowStep({
  step,
  side,
  title,
  body,
}: {
  step: string;
  side: "受け取り側" | "送る側";
  title: string;
  body: string;
}) {
  return (
    <div className="relative rounded-[18px] border border-[#e0d6c5] bg-white px-6 py-7 text-left">
      <div className="absolute -top-[10px] left-5 rounded-full bg-brand-tint px-[10px] py-[3px] text-[10px] font-bold tracking-[0.1em] text-brand-deep">
        {side}
      </div>
      <div className="mb-[2px] text-[30px] leading-none text-brand" style={{ fontFamily: CAVEAT }}>
        {step}
      </div>
      <div className="mb-[10px] text-[22px] font-bold tracking-[-0.015em] text-ink">{title}</div>
      <div className="whitespace-pre-line text-[13px] leading-[1.7] text-ink-soft">{body}</div>
    </div>
  );
}

const FURDROP_FEATURES = [
  "送信者にアカウント不要",
  "受信者のメアドも非公開",
  "撮影者ごとに整理して見られる",
  "撮影者情報を写真に埋込",
  "URL埋め込みOK (SNS / web)",
];

type CompareMark = "ok" | "ng" | "na";

const COMPARE_OTHERS: Array<{ name: string; items: Array<{ text: string; mark: CompareMark }> }> = [
  {
    name: "Google Drive",
    items: [
      { text: "送信者にもアカウント必須", mark: "ng" },
      { text: "メアド・氏名が共有相手に見える", mark: "ng" },
      { text: "撮影者ごとの整理機能なし", mark: "ng" },
      { text: "撮影者情報の埋込なし", mark: "ng" },
      { text: "共有リンクで埋込可", mark: "ok" },
    ],
  },
  {
    name: "イベント専用共有サイト",
    items: [
      { text: "参加者にもアカウント登録が必要", mark: "ng" },
      { text: "受信者はアカウント不要", mark: "ok" },
      { text: "大量の写真から目当てを探す必要", mark: "ng" },
      { text: "撮影者情報の埋込なし", mark: "ng" },
      { text: "URL埋め込みは可能", mark: "ok" },
    ],
  },
  {
    name: "メール",
    items: [
      { text: "送信者がメアドを開示する必要あり", mark: "ng" },
      { text: "受信者のメアドも公開", mark: "ng" },
      { text: "個別到達で探す手間なし", mark: "ok" },
      { text: "撮影者情報の埋込なし", mark: "ng" },
      { text: "URL埋め込みは不可", mark: "ng" },
    ],
  },
];

function MarkBadge({ mark }: { mark: CompareMark }) {
  if (mark === "ok") {
    return (
      <span className="inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-status-success/15 text-[11px] font-bold text-status-success">
        ✓
      </span>
    );
  }
  if (mark === "na") {
    return (
      <span className="inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-surface-sand text-[10px] font-bold text-ink-muted">
        —
      </span>
    );
  }
  return (
    <span className="inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-status-danger/15 text-[10px] font-bold text-status-danger">
      ✕
    </span>
  );
}

function ComparisonCards() {
  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-5">
      {/* FurDrop — featured */}
      <div className="rounded-[20px] border border-[#e0d6c5] bg-brand p-6 text-white shadow-[0_8px_24px_rgba(217,106,74,0.18)] sm:p-8">
        <div className="mb-5 flex items-center gap-3">
          <h3 className="m-0 text-[24px] font-bold tracking-[-0.01em] sm:text-[28px]">FurDrop</h3>
          <span className="rounded-full bg-white/15 px-[11px] py-1 text-[11px] font-semibold">
            写真の受け取りに特化
          </span>
        </div>
        <ul className="grid list-none grid-cols-1 gap-x-5 gap-y-[10px] p-0 sm:grid-cols-2">
          {FURDROP_FEATURES.map((f) => (
            <li
              key={f}
              className="flex items-center gap-[10px] text-[14px] font-medium leading-[1.4]"
            >
              <span className="inline-flex h-[20px] w-[20px] flex-none items-center justify-center rounded-full bg-white text-[12px] font-bold text-brand">
                ✓
              </span>
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* Other services */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {COMPARE_OTHERS.map((svc) => (
          <div key={svc.name} className="rounded-[16px] border border-[#e0d6c5] bg-white p-5">
            <h4 className="m-0 mb-3 text-[14px] font-semibold text-ink-soft">{svc.name}</h4>
            <ul className="m-0 list-none space-y-[6px] p-0">
              {svc.items.map((it) => {
                const tone =
                  it.mark === "ok"
                    ? "text-status-success/85"
                    : it.mark === "ng"
                      ? "text-status-danger/75"
                      : "text-ink-muted";
                return (
                  <li
                    key={it.text}
                    className={`flex items-center gap-2 text-[12px] leading-[1.4] ${tone}`}
                  >
                    <MarkBadge mark={it.mark} />
                    <span>{it.text}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const authState = useAtomValue(authAtom);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const isAuthed = authState.status === "authenticated";
  const primaryHref = isAuthed ? (authState.registered ? "/dashboard" : "/settings") : "/login";
  const primaryLabel = isAuthed
    ? authState.registered
      ? "ダッシュボード"
      : "設定で続きから"
    : "はじめる";

  const goPrimary = () => navigate(primaryHref);

  return (
    <div className="bg-surface-canvas text-ink">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[#e0d6c5] bg-[rgba(250,246,240,0.86)] backdrop-blur-md">
        <div className="flex items-center justify-between px-4 py-3 md:px-14 md:py-[14px]">
          <Link to="/" className="flex items-center gap-[10px]">
            <LogoMark size={32} />
          </Link>
          <div className="flex items-center gap-3">
            <nav className="hidden items-center gap-[26px] text-[13px] text-ink-soft md:flex">
              <Link to="/guide" className="cursor-pointer">
                使い方
              </Link>
              <a href="#features" className="cursor-pointer">
                機能
              </a>
              <a href="#compare" className="cursor-pointer">
                比較
              </a>
              <span className="h-4 w-px bg-[#e0d6c5]" />
              {!isAuthed && (
                <Link to="/login" className="cursor-pointer text-[12px] text-ink-soft">
                  ログイン
                </Link>
              )}
            </nav>
            <button
              type="button"
              onClick={goPrimary}
              className="cursor-pointer rounded-full bg-brand px-[14px] py-[8px] text-[12px] font-semibold text-white md:px-[18px] md:py-[9px]"
            >
              {primaryLabel} →
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="メニュー"
              aria-expanded={menuOpen}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e0d6c5] bg-white text-ink-soft md:hidden"
            >
              <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
                <title>menu</title>
                {menuOpen ? (
                  <path
                    d="M2 2 L14 10 M14 2 L2 10"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                ) : (
                  <path
                    d="M2 2 H14 M2 6 H14 M2 10 H14"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="border-t border-[#e0d6c5] bg-[rgba(250,246,240,0.96)] md:hidden">
            <ul className="flex flex-col text-[14px] text-ink-soft">
              <li>
                <Link
                  to="/guide"
                  onClick={() => setMenuOpen(false)}
                  className="block px-5 py-3 text-inherit"
                >
                  使い方
                </Link>
              </li>
              {[
                { href: "#features", label: "機能" },
                { href: "#compare", label: "比較" },
              ].map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="block px-5 py-3"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
              {!isAuthed && (
                <li>
                  <Link
                    to="/login"
                    onClick={() => setMenuOpen(false)}
                    className="block px-5 py-3 text-inherit"
                  >
                    ログイン
                  </Link>
                </li>
              )}
              {FEEDBACK_URL && (
                <li>
                  <a
                    href={FEEDBACK_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMenuOpen(false)}
                    className="block px-5 py-3"
                  >
                    フィードバック
                  </a>
                </li>
              )}
            </ul>
          </nav>
        )}
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-surface-canvas px-5 pt-8 pb-10 md:px-14 md:pt-[72px] md:pb-24">
        <div className="relative mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-6 md:min-h-[540px] md:grid-cols-[1.1fr_0.9fr] md:gap-14">
          <div className="min-w-0">
            <div
              className="mb-2 inline-block -rotate-1 text-[22px] leading-[1.2] text-brand"
              style={{ fontFamily: CAVEAT }}
            >
              イベントが終わってふと気づく、写真送ってほしいな。
            </div>
            <h1 className="mt-[6px] mb-4 break-words text-[clamp(26px,6vw,32px)] font-bold leading-[1.3] tracking-[-0.025em] text-ink [word-break:keep-all] md:mt-[10px] md:mb-5 md:text-[clamp(32px,4.2vw,48px)]">
              <span
                className="box-decoration-clone px-0.5"
                style={{
                  backgroundImage: "linear-gradient(transparent 62%, #fcede4 62%)",
                }}
              >
                撮ってもらった写真を ちゃんと受け取る
              </span>
            </h1>
            <p className="mb-6 max-w-[480px] text-[15px] leading-[1.8] text-ink-soft md:mb-8 md:text-[16px] md:leading-[1.85]">
              FurDropは、
              <b className="text-ink">メアドもアカウントも交換せずに、撮影者情報だけ写真に残せる</b>
              サービス。
              <br />
              受け取りURLひとつで、面倒な個人情報のやりとりは無し。
            </p>
            <HandleInputBox onSubmit={goPrimary} />
            <div className="mt-[14px] flex items-center gap-[18px] text-[12px] text-ink-muted">
              <span>X (Twitter) で30秒登録</span>
            </div>
          </div>

          {/* Hero photos */}
          <div className="relative h-[280px] min-w-0 origin-top scale-[0.72] md:h-[480px] md:scale-100">
            <PolaroidPhoto
              filename="event_001.jpg"
              rotation={-6}
              width={190}
              height={230}
              gradientAngle={20}
              position={{ top: 20, left: 40 }}
            />
            <PolaroidPhoto
              filename="stage_004.jpg"
              rotation={4}
              width={180}
              height={220}
              gradientAngle={70}
              position={{ top: 60, left: 200 }}
            />
            <PolaroidPhoto
              filename="crowd_012.jpg"
              rotation={-3}
              width={170}
              height={170}
              gradientAngle={120}
              position={{ top: 240, left: 20 }}
            />
            <PolaroidPhoto
              filename="afterparty.jpg"
              rotation={6}
              width={185}
              height={195}
              gradientAngle={45}
              position={{ top: 260, left: 180 }}
            />
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="bg-[#f4eee2] px-5 py-14 md:px-14 md:py-[110px]">
        <div className="mx-auto mb-9 max-w-[760px] text-center md:mb-12">
          <SectionKicker label="よくある困りごと" align="center" />
          <h2 className="mb-4 text-[clamp(28px,7vw,36px)] font-bold leading-[1.25] tracking-[-0.03em] text-ink md:text-[44px]">
            こんな経験
            <br />
            ありませんか？
          </h2>
          <p className="text-[14.5px] leading-[1.85] text-ink-soft">
            撮ってもらった写真、結局どうやって受け取るんだっけ。
          </p>
        </div>
        <div className="mx-auto grid max-w-[880px] grid-cols-1 gap-4 md:grid-cols-2">
          {[
            "DMは知り合いにしか許可したくない",
            "Driveの招待でメアドを知られたくない",
            "イベント共有アルバムから探すのが面倒",
            "「写真送るね」と言ったまま、半年",
          ].map((text) => (
            <div
              key={text}
              className="flex items-center gap-4 rounded-[14px] border border-[#e0d6c5] bg-white px-6 py-5"
            >
              <span className="h-[8px] w-[8px] shrink-0 rotate-45 bg-brand" aria-hidden="true" />
              <p className="m-0 text-[15px] font-medium leading-[1.6] text-ink">{text}</p>
            </div>
          ))}
        </div>
        <div className="mx-auto mt-12 grid max-w-[920px] grid-cols-1 items-center gap-3 rounded-[20px] border border-[#e0d6c5] bg-white px-5 py-6 md:mt-20 md:grid-cols-[1fr_auto_1fr] md:gap-7 md:px-10 md:py-9">
          <div className="text-left md:text-right">
            <div className="mb-[6px] text-[11px] uppercase tracking-[0.16em] text-ink-muted">
              撮影者
            </div>
            <div className="mb-[6px] text-[22px] font-bold tracking-[-0.01em] text-ink">
              送りたい写真がある
            </div>
            <div className="text-[13px] text-ink-soft">でも、送る方法がない。</div>
          </div>
          <div
            className="relative flex h-[88px] w-full flex-col items-center justify-center md:h-[80px] md:w-[220px] md:flex-row"
            aria-hidden="true"
          >
            {/* 上(モバイル) / 左(PC) から流れる線 — 中央に向けて濃くなる */}
            <div className="w-[1.5px] flex-1 rounded-full bg-gradient-to-b from-transparent via-[rgba(217,106,74,0.35)] to-[#d96a4a] md:h-[1.5px] md:w-auto md:bg-gradient-to-r" />
            {/* 内向きシェブロン (モバイル: 下向き / PC: 右向き) */}
            <svg
              width="6"
              height="10"
              viewBox="0 0 6 10"
              className="my-[2px] shrink-0 rotate-90 text-brand md:mx-[4px] md:my-0 md:rotate-0"
              aria-hidden="true"
            >
              <title>arrow</title>
              <path
                d="M 0.6 1 L 5 5 L 0.6 9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {/* 中央の合致点 — ハロー付きダイヤモンド */}
            <div className="relative my-[3px] shrink-0 md:mx-[6px] md:my-0">
              {/* 光彩 */}
              <div
                className="pointer-events-none absolute inset-0 -m-3 rounded-full"
                style={{
                  background: "radial-gradient(circle, rgba(217,106,74,0.22) 0%, transparent 65%)",
                }}
              />
              {/* ダイヤモンド本体（白リングで縁取り） */}
              <div
                className="relative h-[14px] w-[14px] rotate-45"
                style={{
                  background: "#d96a4a",
                  boxShadow:
                    "0 2px 8px rgba(217,106,74,0.30), 0 0 0 3px #fff, 0 0 0 4px rgba(217,106,74,0.40)",
                }}
              />
            </div>
            {/* 内向きシェブロン (モバイル: 上向き / PC: 左向き) */}
            <svg
              width="6"
              height="10"
              viewBox="0 0 6 10"
              className="my-[4px] shrink-0 -rotate-90 text-brand md:mx-[4px] md:my-0 md:rotate-180"
              aria-hidden="true"
            >
              <title>arrow</title>
              <path
                d="M 0.6 1 L 5 5 L 0.6 9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {/* 下(モバイル) / 右(PC) から流れる線 — 中央に向けて濃くなる */}
            <div className="w-[1.5px] flex-1 rounded-full bg-gradient-to-t from-transparent via-[rgba(217,106,74,0.35)] to-[#d96a4a] md:h-[1.5px] md:w-auto md:bg-gradient-to-l" />
          </div>
          <div>
            <div className="mb-[6px] text-[11px] uppercase tracking-[0.16em] text-ink-muted">
              受信者
            </div>
            <div className="mb-[6px] text-[22px] font-bold tracking-[-0.01em] text-ink">
              届いてほしい写真がある
            </div>
            <div className="text-[13px] text-ink-soft">でも、催促しづらい。</div>
          </div>
        </div>
      </section>

      {/* Solution */}
      <section
        id="how"
        className="relative overflow-hidden bg-surface-canvas px-5 py-14 text-ink md:px-14 md:py-[120px]"
      >
        <div className="mx-auto max-w-[920px] text-center">
          <div
            className="mb-3 inline-flex items-center gap-3 text-[36px] text-ink-soft"
            style={{ fontFamily: CAVEAT }}
          >
            <img src={logoUrl} alt="FurDrop" className="inline-block h-9 w-auto sm:h-14" />
          </div>
          <h2 className="mb-6 text-[clamp(28px,7.5vw,40px)] font-bold leading-[1.25] tracking-[-0.03em] text-ink [word-break:keep-all] md:text-[clamp(34px,4.5vw,56px)]">
            個人情報の交換なしで
            <br />
            <span
              className="box-decoration-clone px-1"
              style={{ backgroundImage: "linear-gradient(transparent 62%, #fcede4 62%)" }}
            >
              撮影者情報は残せる
            </span>
            <br />
            写真の受け取り
          </h2>
          <p className="mx-auto mb-10 max-w-[600px] text-[15px] leading-[1.85] text-ink-soft md:mb-14 md:text-[16px] md:leading-[1.9]">
            受け取り側がURLをひとつ作るだけ。送る側はアカウントもメアドも要らない。
            <br />
            それでも、誰が撮ったかも写真に残せる。
          </p>
          <div className="mt-6 grid grid-cols-1 items-stretch md:grid-cols-[1fr_auto_1fr_auto_1fr]">
            <FlowStep
              step="1"
              side="受け取り側"
              title="URLを作る"
              body={`X (Twitter)で30秒。\n${PUBLIC_HOST}/send/your_handle が完成。`}
            />
            <div className="mx-auto my-2 flex w-10 rotate-90 items-center justify-center self-center md:mx-0 md:my-0 md:rotate-0">
              <ArrowRight />
            </div>
            <FlowStep
              step="2"
              side="受け取り側"
              title="URLを共有"
              body={"プロフィールやイベントページに貼るだけ。\nQRも自動生成。"}
            />
            <div className="mx-auto my-2 flex w-10 rotate-90 items-center justify-center self-center md:mx-0 md:my-0 md:rotate-0">
              <ArrowRight />
            </div>
            <FlowStep
              step="3"
              side="送る側"
              title="写真が届く"
              body={"送る側はURLにドロップするだけ。\nアカウント不要、匿名のまま。"}
            />
          </div>
          <div className="mt-10 flex justify-center md:mt-14">
            <Link
              to="/guide"
              className="inline-flex items-center gap-2 rounded-full border border-[#e0d6c5] bg-white px-5 py-3 text-[13px] font-semibold text-ink-soft transition-colors hover:border-brand/50 hover:text-brand"
            >
              詳しい使い方を見る
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Two pillars */}
      <section id="features" className="bg-[#f4eee2] px-5 py-14 md:px-14 md:py-[120px]">
        <div className="mx-auto mb-10 max-w-[720px] text-center md:mb-[72px]">
          <SectionKicker label="FurDropの特長" align="center" />
          <h2 className="m-0 text-[clamp(28px,7vw,36px)] font-bold leading-[1.15] tracking-[-0.03em] md:text-[clamp(36px,4.6vw,52px)]">
            FurDropの
            <br />
            二つの軸
          </h2>
        </div>
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-5 md:grid-cols-2 md:gap-7">
          {/* Pillar 01 — anonymous */}
          <div className="relative overflow-hidden rounded-3xl border border-[#e0d6c5] bg-white p-7 md:p-11">
            <div className="absolute -top-10 -right-10 h-[200px] w-[200px] rounded-full bg-brand-tint opacity-70" />
            <div className="relative">
              <div
                className="mb-[6px] text-[34px] leading-none text-brand"
                style={{ fontFamily: CAVEAT }}
              >
                01
              </div>
              <h3 className="mb-[14px] text-[28px] font-bold leading-[1.2] tracking-[-0.02em] md:mb-[18px] md:text-[36px]">
                個人情報は
                <br />
                交換しない
              </h3>
              <p className="mb-5 max-w-[380px] text-[14px] leading-[1.8] text-ink-soft md:mb-7 md:text-[14.5px] md:leading-[1.85]">
                送信者はアカウント不要。受信者もメアドを開示しない。
                お互いの個人情報を交換せずに、写真だけを受け渡せます。
                URLを知っている人だけが送信できる、ゆるいクローズドな入り口。
              </p>
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#e0d6c5] bg-surface-canvas p-[22px] md:flex-row md:items-center md:justify-between md:gap-4">
                <div className="text-center md:flex-1">
                  <div className="mx-auto mb-2 flex h-[50px] w-[50px] items-center justify-center rounded-full border-[1.5px] border-dashed border-[#b8ac97] bg-white text-[18px]">
                    ?
                  </div>
                  <div className="text-[11px] text-ink-muted" style={{ fontFamily: MONO }}>
                    送信者 (匿名)
                  </div>
                </div>
                <div
                  className="max-w-full truncate rounded-md border border-[#e0d6c5] bg-white px-[10px] py-[6px] text-[11px] text-ink-muted md:max-w-none md:whitespace-nowrap"
                  style={{ fontFamily: MONO }}
                >
                  {SAMPLE_RECEIVE_URL}
                </div>
                <div className="text-center md:flex-1">
                  <div className="mx-auto mb-2 flex h-[50px] w-[50px] items-center justify-center rounded-full bg-brand text-[14px] font-bold text-white">
                    Fur
                  </div>
                  <div className="text-[11px] text-ink-muted" style={{ fontFamily: MONO }}>
                    受信者
                  </div>
                </div>
              </div>
              <ul className="mt-6 list-none p-0 text-[13px] leading-[1.7] text-ink-soft">
                {[
                  "送信者の登録・アカウント作成は不要",
                  "受信者のメールアドレスは公開されない",
                  "URLを知っている人だけが送信できる",
                ].map((t) => (
                  <li key={t} className="relative mb-[6px] pl-[18px]">
                    <span className="absolute left-0 text-brand">✓</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Pillar 02 — sender info */}
          <div className="relative overflow-hidden rounded-3xl border border-[#e0d6c5] bg-white p-7 md:p-11">
            <div className="absolute -top-10 -right-10 h-[200px] w-[200px] rounded-full bg-[#e9ddc8] opacity-60" />
            <div className="relative">
              <div
                className="mb-[6px] text-[34px] leading-none text-brand"
                style={{ fontFamily: CAVEAT }}
              >
                02
              </div>
              <h3 className="mb-[14px] text-[28px] font-bold leading-[1.2] tracking-[-0.02em] md:mb-[18px] md:text-[36px]">
                撮影者情報を
                <br />
                写真に
              </h3>
              <p className="mb-5 max-w-[380px] text-[14px] leading-[1.8] text-ink-soft md:mb-7 md:text-[14.5px] md:leading-[1.85]">
                EXIFのカメラモデル欄や目立たない透かしで、撮影者情報を写真ファイル自体に埋め込み可能。
                匿名性と「誰が撮ったか」の追跡可能性を両立できます。
              </p>
              <div
                className="overflow-hidden rounded-xl border border-[#e0d6c5] bg-surface-canvas text-[11px]"
                style={{ fontFamily: MONO }}
              >
                <div className="border-b border-[#e0d6c5] bg-surface-sand px-[14px] py-2 tracking-[0.1em] text-ink-soft">
                  EXIF · IMG_0421.jpg
                </div>
                {[
                  ["Camera Model", "@photographer_furdrop"],
                  ["Date Taken", "2026:04:14 19:32:08"],
                  ["Software", "furdrop.app"],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="flex justify-between border-b border-dashed border-[#e0d6c5] px-[14px] py-[6px] text-ink-soft"
                  >
                    <span>{k}</span>
                    <span className="font-semibold text-ink">{v}</span>
                  </div>
                ))}
              </div>
              <ul className="mt-6 list-none p-0 text-[13px] leading-[1.7] text-ink-soft">
                {[
                  "EXIF埋め込み (Camera Model欄)",
                  "送信者が選べる位置の透かしテキスト",
                  "受信者が許可した方式だけが有効",
                ].map((t) => (
                  <li key={t} className="relative mb-[6px] pl-[18px]">
                    <span className="absolute left-0 text-brand">✓</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How it looks */}
      <section className="bg-surface-canvas px-5 py-14 md:px-14 md:py-[120px]">
        <div className="mx-auto max-w-[1180px]">
          <div className="mb-10 max-w-[720px] md:mb-14">
            <SectionKicker label="送る側の画面" />
            <h2 className="mb-4 text-[clamp(28px,7vw,36px)] font-bold leading-[1.15] tracking-[-0.03em] md:text-[clamp(36px,4.6vw,52px)]">
              送る側に
              <br />
              必要なのはURLだけ
            </h2>
            <p className="m-0 max-w-[540px] text-[15px] leading-[1.85] text-ink-soft">
              受け取り側が共有したURLを開いて、写真をドロップするだけ。
              アプリも、サインアップも、メアドの入力も発生しません。
            </p>
          </div>
          <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[1.1fr_0.9fr] md:gap-10">
            {/* Browser mock */}
            <div className="overflow-hidden rounded-2xl border border-[#e0d6c5] bg-white shadow-[0_24px_60px_rgba(42,31,27,0.14)]">
              <div className="flex items-center gap-2 border-b border-[#e0d6c5] bg-surface-sand px-4 py-3">
                <div className="flex gap-[6px]">
                  <div className="h-[11px] w-[11px] rounded-md bg-brand opacity-70" />
                  <div className="h-[11px] w-[11px] rounded-md bg-[#e8c66a] opacity-70" />
                  <div className="h-[11px] w-[11px] rounded-md bg-[#a2b57f] opacity-70" />
                </div>
                <div
                  className="ml-3 flex-1 rounded-md border border-[#e0d6c5] bg-white px-3 py-[5px] text-[11px] text-ink-soft"
                  style={{ fontFamily: MONO }}
                >
                  {SAMPLE_RECEIVE_URL}
                </div>
              </div>
              <div className="p-5 md:p-8">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-[14px] font-bold text-white">
                    Fur
                  </div>
                  <div>
                    <div className="text-[15px] font-bold text-ink">
                      @{SAMPLE_HANDLE} に写真を送る
                    </div>
                    <div className="text-[11px] text-ink-muted" style={{ fontFamily: MONO }}>
                      2026年4月14日のイベント
                    </div>
                  </div>
                </div>
                <div className="mb-4 rounded-[14px] border-2 border-dashed border-[#b8ac97] bg-brand-tint px-6 py-9 text-center">
                  <svg
                    width="36"
                    height="36"
                    viewBox="0 0 36 36"
                    className="mx-auto mb-2 text-brand"
                    aria-hidden="true"
                  >
                    <title>photo</title>
                    <rect
                      x="5"
                      y="8"
                      width="26"
                      height="20"
                      rx="3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <circle
                      cx="12.5"
                      cy="15"
                      r="2.4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M7 25 L15 18 L21 23 L25 19 L29 23"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="mb-1 text-[14px] font-semibold text-ink">
                    ここに写真をドロップ
                  </div>
                  <div className="text-[12px] text-ink-soft">JPEG · PNG · HEIC · 最大20MB/枚</div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[0, 40, 80, 120].map((angle, i) => (
                    <div key={angle} className="relative">
                      <div
                        className="relative h-[70px] w-full overflow-hidden rounded border border-[#e0d6c5]"
                        style={{
                          background: `repeating-linear-gradient(${angle}deg, transparent 0, transparent 7px, rgba(42,31,27,0.05) 7px, rgba(42,31,27,0.05) 8px) #f1e8db`,
                        }}
                      >
                        <div
                          className="absolute inset-0 flex items-center justify-center text-[10px] tracking-[0.06em] text-ink-muted"
                          style={{ fontFamily: MONO }}
                        >
                          IMG_041{8 + i}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-[18px] flex items-center justify-between">
                  <div className="text-[12px] text-ink-soft" style={{ fontFamily: MONO }}>
                    4 files · 18.2 MB
                  </div>
                  <button
                    type="button"
                    className="rounded-[10px] bg-brand px-5 py-[10px] text-[13px] font-semibold text-white"
                  >
                    送信 →
                  </button>
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#e0d6c5] bg-surface-canvas px-3 py-[10px] text-[11px] text-ink-muted">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 14 14"
                    className="shrink-0"
                    aria-hidden="true"
                  >
                    <title>lock</title>
                    <rect
                      x="2.5"
                      y="6.2"
                      width="9"
                      height="6"
                      rx="1.4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                    <path
                      d="M4.5 6.2 V4.6 a2.5 2.5 0 0 1 5 0 V6.2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                  </svg>
                  <span>アカウント登録もメアド入力も不要</span>
                </div>
              </div>
            </div>

            {/* Right column points */}
            <div className="flex flex-col gap-[18px]">
              {[
                {
                  k: "A",
                  title: "受け取り手のハンドルだけ",
                  body: "送る側はメアドもアカウントも作らない。URLを開いて、ドロップ。",
                },
                {
                  k: "B",
                  title: "撮影者情報を写真に残せる",
                  body: "送信時に入力した撮影者情報を、EXIFや透かしで写真自体に埋込可能 (受信者の許可方式に従う)。",
                },
                {
                  k: "C",
                  title: "QRコードも自動生成",
                  body: "ダッシュボードでQRを表示・コピー・共有。配布物に貼るだけ。",
                },
              ].map((p) => (
                <div key={p.k} className="flex items-start gap-[14px]">
                  <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-brand text-[12px] font-bold text-white">
                    {p.k}
                  </div>
                  <div>
                    <div className="mb-1 text-[15px] font-bold text-ink">{p.title}</div>
                    <div className="text-[13px] leading-[1.65] text-ink-soft">{p.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section id="compare" className="bg-[#f4eee2] px-5 py-14 md:px-14 md:py-[120px]">
        <div className="mx-auto mb-10 max-w-[720px] text-center md:mb-14">
          <SectionKicker label="くらべる" align="center" />
          <h2 className="mb-[14px] text-[clamp(28px,7vw,36px)] font-bold leading-[1.15] tracking-[-0.03em] md:text-[clamp(32px,4.2vw,48px)]">
            他の方法との違い
          </h2>
          <p className="m-0 text-[15px] text-ink-soft">
            「写真を受け取る」ことに、特化しています。
          </p>
        </div>
        <ComparisonCards />
      </section>

      {/* Footer */}
      <footer className="border-t border-[#e0d6c5] bg-surface-canvas px-5 pt-12 pb-8 md:px-14 md:pt-[72px]">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-6 md:gap-12">
          <div>
            <div className="flex items-center gap-[10px]">
              <LogoMark size={36} />
            </div>
            <p className="mt-5 mb-0 max-w-[280px] text-[13px] leading-[1.8] text-ink-soft">
              撮ってもらった写真を、ちゃんと受け取る。
              <br />
              個人情報の交換なし、撮影者情報は写真に。
            </p>
          </div>
          <nav className="ml-auto flex w-full flex-wrap items-center justify-end gap-4 text-[13px] text-ink-soft md:w-auto md:gap-6">
            {!isAuthed && (
              <Link to="/login" className="text-inherit">
                ログイン
              </Link>
            )}
            <Link to={primaryHref} className="text-inherit">
              {primaryLabel}
            </Link>
            {FEEDBACK_URL && (
              <a
                href={FEEDBACK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-inherit"
              >
                フィードバック
              </a>
            )}
          </nav>
        </div>
        <div className="mx-auto mt-8 flex max-w-[1180px] flex-col items-start gap-2 border-t border-[#e0d6c5] pt-6 text-[11px] tracking-[0.04em] text-ink-muted md:mt-12 md:flex-row md:items-center md:justify-between md:gap-0">
          <span>© 2026 FurDrop — Made in Tokyo.</span>
        </div>
      </footer>
    </div>
  );
}
