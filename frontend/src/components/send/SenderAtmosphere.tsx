type Tone = "warm" | "calm" | "celebrate";

type Props = {
  /**
   * トーン:
   * - warm: S01 ランディング向け。コーラル + 砂のソフトブロブで「迎え入れる」雰囲気
   * - calm: S03 アップロード中向け。主張を抑えて動作の邪魔をしない
   * - celebrate: S04 完了向け。success-tint を混ぜて祝祭感を出す
   */
  tone?: Tone;
};

/**
 * 送信ページの背景アトモスフィアレイヤー。
 * ワイド画面でコンテンツ周囲の余白に温かみを与える装飾。
 * 親に `relative overflow-hidden` を当てた上で、絶対配置で全面に敷く。
 */
export default function SenderAtmosphere({ tone = "warm" }: Props) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {tone === "warm" && (
        <>
          <div className="absolute -top-32 -left-32 h-[28rem] w-[28rem] rounded-full bg-brand-tint opacity-70 blur-3xl sm:-left-24" />
          <div className="absolute -right-40 top-1/3 h-[32rem] w-[32rem] rounded-full bg-surface-sand opacity-80 blur-3xl" />
          <div className="absolute -bottom-40 left-1/4 h-[24rem] w-[24rem] rounded-full bg-brand-tint opacity-50 blur-3xl" />
        </>
      )}
      {tone === "calm" && (
        <>
          <div className="absolute -top-24 -right-24 h-[24rem] w-[24rem] rounded-full bg-surface-sand opacity-60 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 h-[24rem] w-[24rem] rounded-full bg-brand-tint opacity-40 blur-3xl" />
        </>
      )}
      {tone === "celebrate" && (
        <>
          <div className="absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full bg-status-success-tint opacity-80 blur-3xl" />
          <div className="absolute -right-32 top-1/4 h-[30rem] w-[30rem] rounded-full bg-brand-tint opacity-70 blur-3xl" />
          <div className="absolute -bottom-32 left-1/3 h-[24rem] w-[24rem] rounded-full bg-surface-sand opacity-70 blur-3xl" />
        </>
      )}
      {/* 細かな粒子感 (DESIGN.md のフィルムアルバム風) */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.035] mix-blend-multiply"
        xmlns="http://www.w3.org/2000/svg"
        role="presentation"
      >
        <filter id="senderGrain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#senderGrain)" />
      </svg>
    </div>
  );
}
