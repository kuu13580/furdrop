import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "./i18n";
import { generateId } from "./id";

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

/**
 * 透かし (フリードロー配置) のモデルと描画ロジック。
 *
 * 座標系はアンカー吸着方式:
 *   要素の中心 = anchor(0|0.5|1 の9点) × キャンバス寸法 + offset × 長辺
 * offset を長辺比で持つことで、フォントサイズ (同じく長辺比) と同じ単位でスケールし、
 * 縦横比の違う写真間でも「角からの見た目の余白」が保たれる。
 * 描画時は要素ごとに独立して bbox をクランプし、どの写真でも全文が収まる。
 */

// ========== フォントカタログ ==========

export type WatermarkFontCategory = "basic" | "pop" | "impact" | "hand";

export const WATERMARK_FONT_CATEGORIES: { id: WatermarkFontCategory; label: MessageDescriptor }[] =
  [
    { id: "basic", label: msg`定番` },
    { id: "pop", label: msg`丸ゴ・ポップ` },
    { id: "impact", label: msg`インパクト` },
    { id: "hand", label: msg`手書き・デザイン` },
  ];

type WatermarkFontDef = {
  id: string;
  /** ピッカー表示名 (そのフォント自身でレンダリングされる) */
  label: MessageDescriptor;
  /** Google Fonts の family 名 */
  family: string;
  /** css2 API の family クエリ (URL エンコード済み、weight 指定込み) */
  query: string;
  /** ctx.font / document.fonts.load に渡すウェイト */
  weight: 400 | 500 | 600 | 700;
  /** フォールバックの generic family */
  fallback: "sans-serif" | "serif";
  category: WatermarkFontCategory;
};

/**
 * 全て Google Fonts の Web フォント。端末によらず同じ字形で焼き込まれる。
 * CJK フォントは unicode-range 分割配信のため、CSS を読み込んでも実フォントは
 * 必要グリフ分しかダウンロードされない (ensureWatermarkFonts / DOM 表示が起点)。
 */
export const WATERMARK_FONTS = [
  // 定番
  {
    id: "noto-sans",
    label: msg`ゴシック`,
    family: "Noto Sans JP",
    query: "Noto+Sans+JP:wght@700",
    weight: 700,
    fallback: "sans-serif",
    category: "basic",
  },
  {
    id: "zen-kaku",
    label: msg`角ゴシック`,
    family: "Zen Kaku Gothic New",
    query: "Zen+Kaku+Gothic+New:wght@700",
    weight: 700,
    fallback: "sans-serif",
    category: "basic",
  },
  {
    id: "biz-ud",
    label: msg`UDゴシック`,
    family: "BIZ UDGothic",
    query: "BIZ+UDGothic:wght@700",
    weight: 700,
    fallback: "sans-serif",
    category: "basic",
  },
  {
    id: "noto-serif",
    label: msg`明朝`,
    family: "Noto Serif JP",
    query: "Noto+Serif+JP:wght@700",
    weight: 700,
    fallback: "serif",
    category: "basic",
  },
  {
    id: "shippori",
    label: msg`しっぽり明朝`,
    family: "Shippori Mincho",
    query: "Shippori+Mincho:wght@700",
    weight: 700,
    fallback: "serif",
    category: "basic",
  },
  {
    id: "zen-old-mincho",
    label: msg`オールド明朝`,
    family: "Zen Old Mincho",
    query: "Zen+Old+Mincho:wght@700",
    weight: 700,
    fallback: "serif",
    category: "basic",
  },
  // 丸ゴ・ポップ
  {
    id: "zen-maru",
    label: msg`丸ゴシック`,
    family: "Zen Maru Gothic",
    query: "Zen+Maru+Gothic:wght@700",
    weight: 700,
    fallback: "sans-serif",
    category: "pop",
  },
  {
    id: "mplus-rounded",
    label: msg`Mプラス丸`,
    family: "M PLUS Rounded 1c",
    query: "M+PLUS+Rounded+1c:wght@700",
    weight: 700,
    fallback: "sans-serif",
    category: "pop",
  },
  {
    id: "kiwi-maru",
    label: msg`キウイ丸`,
    family: "Kiwi Maru",
    query: "Kiwi+Maru:wght@500",
    weight: 500,
    fallback: "serif",
    category: "pop",
  },
  {
    id: "mochiy-pop",
    label: msg`モッチーポップ`,
    family: "Mochiy Pop One",
    query: "Mochiy+Pop+One",
    weight: 400,
    fallback: "sans-serif",
    category: "pop",
  },
  {
    id: "hachi-maru",
    label: msg`はちまるポップ`,
    family: "Hachi Maru Pop",
    query: "Hachi+Maru+Pop",
    weight: 400,
    fallback: "sans-serif",
    category: "pop",
  },
  {
    id: "potta",
    label: msg`ポッタ`,
    family: "Potta One",
    query: "Potta+One",
    weight: 400,
    fallback: "sans-serif",
    category: "pop",
  },
  // インパクト
  {
    id: "dela-gothic",
    label: msg`デラゴシック`,
    family: "Dela Gothic One",
    query: "Dela+Gothic+One",
    weight: 400,
    fallback: "sans-serif",
    category: "impact",
  },
  {
    id: "rocknroll",
    label: msg`ロックンロール`,
    family: "RocknRoll One",
    query: "RocknRoll+One",
    weight: 400,
    fallback: "sans-serif",
    category: "impact",
  },
  {
    id: "reggae",
    label: msg`レゲエ`,
    family: "Reggae One",
    query: "Reggae+One",
    weight: 400,
    fallback: "sans-serif",
    category: "impact",
  },
  {
    id: "rampart",
    label: msg`ランパート`,
    family: "Rampart One",
    query: "Rampart+One",
    weight: 400,
    fallback: "sans-serif",
    category: "impact",
  },
  {
    id: "train",
    label: msg`トレイン`,
    family: "Train One",
    query: "Train+One",
    weight: 400,
    fallback: "sans-serif",
    category: "impact",
  },
  {
    id: "dot-gothic",
    label: msg`ドットゴシック`,
    family: "DotGothic16",
    query: "DotGothic16",
    weight: 400,
    fallback: "sans-serif",
    category: "impact",
  },
  // 手書き・デザイン
  {
    id: "yusei-magic",
    label: msg`油性マジック`,
    family: "Yusei Magic",
    query: "Yusei+Magic",
    weight: 400,
    fallback: "sans-serif",
    category: "hand",
  },
  {
    id: "yomogi",
    label: msg`よもぎ`,
    family: "Yomogi",
    query: "Yomogi",
    weight: 400,
    fallback: "sans-serif",
    category: "hand",
  },
  {
    id: "klee",
    label: msg`クレー`,
    family: "Klee One",
    query: "Klee+One:wght@600",
    weight: 600,
    fallback: "sans-serif",
    category: "hand",
  },
  {
    id: "kurenaido",
    label: msg`紅道`,
    family: "Zen Kurenaido",
    query: "Zen+Kurenaido",
    weight: 400,
    fallback: "sans-serif",
    category: "hand",
  },
  {
    id: "kaisei-decol",
    label: msg`解星デコール`,
    family: "Kaisei Decol",
    query: "Kaisei+Decol:wght@700",
    weight: 700,
    fallback: "serif",
    category: "hand",
  },
  {
    id: "yuji-syuku",
    label: msg`佑字 肅`,
    family: "Yuji Syuku",
    query: "Yuji+Syuku",
    weight: 400,
    fallback: "serif",
    category: "hand",
  },
] as const satisfies readonly WatermarkFontDef[];

export type WatermarkFontId = (typeof WATERMARK_FONTS)[number]["id"];

export const DEFAULT_WATERMARK_FONT: WatermarkFontId = "noto-sans";

const FONT_BY_ID: ReadonlyMap<string, WatermarkFontDef> = new Map(
  WATERMARK_FONTS.map((f) => [f.id, f]),
);

export function getWatermarkFont(fontId: string): WatermarkFontDef {
  return FONT_BY_ID.get(fontId) ?? (FONT_BY_ID.get(DEFAULT_WATERMARK_FONT) as WatermarkFontDef);
}

/** CSS / ctx.font に渡すフォントスタック */
export function watermarkFontStack(fontId: string): string {
  const def = getWatermarkFont(fontId);
  return `"${def.family}", ${def.fallback}`;
}

/** ctx.font 用のフォント指定文字列 */
export function watermarkCtxFont(fontId: string, fontSizePx: number): string {
  const def = getWatermarkFont(fontId);
  return `${def.weight} ${fontSizePx}px ${watermarkFontStack(fontId)}`;
}

const FONT_CSS_LINK_ID = "watermark-fonts-css";

let fontCssPromise: Promise<void> | null = null;

/**
 * 全透かしフォントの Google Fonts CSS を 1 リクエストで読み込む (初回のみ)。
 * CSS 自体は unicode-range の宣言集で、実フォントのダウンロードは
 * グリフが実際に必要になった時 (DOM 表示 / document.fonts.load) まで発生しない。
 *
 * 返り値の Promise はスタイルシートの読み込み完了で解決する。@font-face が登録される前に
 * document.fonts.load を呼ぶと「未知のフォント」として即座に空解決してしまうため、
 * グリフのロード前に必ずこれを await する。失敗時も resolve する (フォールバック描画で続行)。
 */
export function ensureWatermarkFontCss(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (fontCssPromise) return fontCssPromise;
  fontCssPromise = new Promise((resolve) => {
    const families = WATERMARK_FONTS.map((f) => `family=${f.query}`).join("&");
    const link = document.createElement("link");
    link.id = FONT_CSS_LINK_ID;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
  return fontCssPromise;
}

/**
 * 指定フォントで text を描画するのに必要なグリフのロードを待つ。
 * 未ロードのまま Canvas に焼き込むとシステムフォントへ暗黙フォールバックするため、
 * 焼き込み・プレビュー描画の前に必ず待機する。失敗時はフォールバックで続行。
 */
async function ensureWatermarkFontLoaded(fontId: string, text: string): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  await ensureWatermarkFontCss();
  const def = getWatermarkFont(fontId);
  try {
    await document.fonts.load(`${def.weight} 64px "${def.family}"`, text || "あ");
  } catch {
    // ロード失敗時はフォールバックフォントで描画する
  }
}

/** 複数要素で使う全フォント (要素ごとのテキストのグリフ) のロードを待つ */
export async function ensureWatermarkFonts(elements: WatermarkRenderElement[]): Promise<void> {
  const textsByFont = new Map<string, string>();
  for (const el of elements) {
    if (!el.text) continue;
    textsByFont.set(el.fontId, (textsByFont.get(el.fontId) ?? "") + el.text);
  }
  await Promise.all(
    [...textsByFont].map(([fontId, text]) => ensureWatermarkFontLoaded(fontId, text)),
  );
}

/** ピッカー表示用に各フォントのラベル分グリフを先読みする (fire-and-forget) */
export function preloadWatermarkFontLabels(): void {
  if (typeof document === "undefined" || !document.fonts) return;
  void ensureWatermarkFontCss().then(() => {
    for (const def of WATERMARK_FONTS) {
      document.fonts.load(`${def.weight} 16px "${def.family}"`, i18n._(def.label)).catch(() => {});
    }
  });
}

// ========== カラーパレット ==========

/**
 * パレット色は「明variant / 暗variant」のペア。描画時に要素位置の背景輝度から
 * どちらを焼くかを自動選択する (暗い背景 → 明variant)。
 * カスタム色 (#hex) は固定色で、視認性は縁取りで担保する。
 */
export type WatermarkPaletteDef = {
  id: string;
  label: MessageDescriptor;
  light: string;
  dark: string;
};

export const WATERMARK_PALETTES = [
  { id: "mono", label: msg`白 / 黒`, light: "#ffffff", dark: "#111111" },
  { id: "coral", label: msg`コーラル`, light: "#ffa07e", dark: "#93341a" },
  { id: "amber", label: msg`アンバー`, light: "#ffc85c", dark: "#7a4e00" },
  { id: "green", label: msg`グリーン`, light: "#93dba0", dark: "#1f5c30" },
  { id: "sky", label: msg`スカイ`, light: "#85c8f2", dark: "#114e7e" },
  { id: "violet", label: msg`バイオレット`, light: "#c6acee", dark: "#482578" },
  { id: "pink", label: msg`ピンク`, light: "#f7a8c8", dark: "#8a2b57" },
] as const satisfies readonly WatermarkPaletteDef[];

export type WatermarkPaletteId = (typeof WATERMARK_PALETTES)[number]["id"];

export const DEFAULT_WATERMARK_COLOR: WatermarkPaletteId = "mono";

const PALETTE_BY_ID: ReadonlyMap<string, WatermarkPaletteDef> = new Map(
  WATERMARK_PALETTES.map((p) => [p.id, p]),
);

export function getWatermarkPalette(color: string): WatermarkPaletteDef | undefined {
  return PALETTE_BY_ID.get(color);
}

/** #rrggbb 形式か (カスタム固定色) */
export function isCustomWatermarkColor(color: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(color);
}

// ========== 要素モデル ==========

export const MAX_WATERMARK_ELEMENTS = 5;

/**
 * 数値フィールドの有効範囲 + デフォルト。UI のスライダーと localStorage 復元時の
 * クランプ (sanitizeWatermarkElements) の両方がここを読む唯一の定義。
 */
export const WATERMARK_RANGES = {
  fontSizeRatio: { min: 0.005, max: 0.15, step: 0.002, default: 0.02 },
  rectW: { min: 0.05, max: 1, step: 0.01, default: 0.35 },
  rectH: { min: 0.02, max: 0.6, step: 0.01, default: 0.12 },
  rectRadius: { min: 0, max: 0.5, step: 0.01, default: 0.15 },
  opacity: { min: 0.1, max: 1, step: 0.05, default: 0.8 },
} as const;

export type WatermarkAnchorValue = 0 | 0.5 | 1;

/**
 * 要素の種別。
 * - text: 文字。サイズはフォントサイズ比、内容はテキスト計測で決まる
 * - rect: 四角形 (文字を写真から浮かせる下地)。幅・高さを長辺比で持つ。
 *   描画は常にテキストより先 (背面) — z 順の管理 UI を持ち込まないための固定ルール
 */
export type WatermarkElementKind = "text" | "rect";

/** 描画に必要な最終形 (テキスト解決済み) */
export type WatermarkRenderElement = {
  id: string;
  kind: WatermarkElementKind;
  /** text 要素の内容 (rect では常に空文字) */
  text: string;
  /** 吸着先アンカー (キャンバス寸法に対する比。0 | 0.5 | 1 の9点) */
  anchor: { x: WatermarkAnchorValue; y: WatermarkAnchorValue };
  /** アンカーから要素中心までのオフセット (画像長辺に対する比) */
  offset: { x: number; y: number };
  /** text 専用: 画像長辺に対するフォントサイズ比 */
  fontSizeRatio: number;
  /** rect 専用: 画像長辺に対する幅・高さの比 */
  rectW: number;
  rectH: number;
  /** rect 専用: 角丸の比 (短辺に対する。0=直角 〜 0.5=カプセル形) */
  rectRadius: number;
  /** 透明度 (0.1 〜 1.0) */
  opacity: number;
  /** パレットID (明暗自動) または "#rrggbb" (固定色) */
  color: string;
  fontId: WatermarkFontId;
  /** text 専用: 縁取り (フィル色の反対輝度色でアウトライン) */
  stroke: boolean;
};

/** 編集・永続化用の要素。autoText の間はテキストが送信者名に追従する */
export type WatermarkElement = WatermarkRenderElement & {
  /** true の間は text の代わりに送信者名を使う (テキスト編集で false 化)。rect では未使用 */
  autoText: boolean;
};

export function createWatermarkElement(partial?: Partial<WatermarkElement>): WatermarkElement {
  return {
    id: generateId(),
    kind: "text",
    text: "",
    autoText: false,
    anchor: { x: 0.5, y: 0.5 },
    offset: { x: 0, y: 0 },
    fontSizeRatio: WATERMARK_RANGES.fontSizeRatio.default,
    rectW: WATERMARK_RANGES.rectW.default,
    rectH: WATERMARK_RANGES.rectH.default,
    rectRadius: WATERMARK_RANGES.rectRadius.default,
    opacity: WATERMARK_RANGES.opacity.default,
    color: DEFAULT_WATERMARK_COLOR,
    fontId: DEFAULT_WATERMARK_FONT,
    stroke: false,
    ...partial,
  };
}

/**
 * 四角形要素を作る。下地用途なので半透明を既定にし、色は固定の白 (単色) を既定にする
 * (ドラッグ中に明暗が切り替わる自動色は下地には不向きなため。パレットへの変更は可能)
 */
export function createWatermarkRectElement(partial?: Partial<WatermarkElement>): WatermarkElement {
  return createWatermarkElement({ kind: "rect", opacity: 0.5, color: "#ffffff", ...partial });
}

/** 描画順: 四角形を先 (背面)、テキストを後 (前面)。同種内は配列順を保つ */
export function watermarkDrawOrder<T extends { kind: WatermarkElementKind }>(elements: T[]): T[] {
  return [
    ...elements.filter((e) => e.kind === "rect"),
    ...elements.filter((e) => e.kind !== "rect"),
  ];
}

/**
 * 初期状態: クレジット (送信者名) を右下に置く要素 1 つ。
 * offset は小さめの負値にし、描画時のクランプで角に snug に収まる。
 */
export function createDefaultWatermarkElements(): WatermarkElement[] {
  return [
    createWatermarkElement({
      autoText: true,
      anchor: { x: 1, y: 1 },
      offset: { x: -0.02, y: -0.02 },
    }),
  ];
}

/**
 * autoText 要素をクレジット文字列 (送信者名) で解決し、空テキスト要素を除いた
 * 描画用配列を返す。rect 要素はテキストを持たないので常に残る。
 */
export function resolveWatermarkElements(
  elements: WatermarkElement[],
  credit: string,
): WatermarkRenderElement[] {
  return elements
    .map(({ autoText, ...el }) => ({
      ...el,
      text: el.kind === "rect" ? "" : (autoText ? credit : el.text).trim(),
    }))
    .filter((el) => el.kind === "rect" || el.text.length > 0);
}

// ========== 永続化 / DB 記録 ==========

const ANCHOR_VALUES: readonly number[] = [0, 0.5, 1];

function asAnchorValue(v: unknown): WatermarkAnchorValue {
  return ANCHOR_VALUES.includes(v as number) ? (v as WatermarkAnchorValue) : 0.5;
}

function asFiniteNumber(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return clamp(v, min, max);
}

function asRanged(v: unknown, range: { min: number; max: number; default: number }): number {
  return asFiniteNumber(v, range.default, range.min, range.max);
}

/**
 * localStorage 等から復元した値を検証して WatermarkElement[] に正規化する。
 * 不正な要素は捨て、フィールド単位の不正はデフォルトへフォールバックする。
 */
export function sanitizeWatermarkElements(raw: unknown): WatermarkElement[] {
  if (!Array.isArray(raw)) return [];
  const out: WatermarkElement[] = [];
  for (const item of raw.slice(0, MAX_WATERMARK_ELEMENTS)) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const anchor = (r.anchor ?? {}) as Record<string, unknown>;
    const offset = (r.offset ?? {}) as Record<string, unknown>;
    const color =
      typeof r.color === "string" && (PALETTE_BY_ID.has(r.color) || isCustomWatermarkColor(r.color))
        ? r.color
        : DEFAULT_WATERMARK_COLOR;
    out.push(
      createWatermarkElement({
        id: typeof r.id === "string" && r.id ? r.id : generateId(),
        kind: r.kind === "rect" ? "rect" : "text",
        text: typeof r.text === "string" ? r.text.slice(0, 200) : "",
        autoText: r.autoText === true,
        anchor: { x: asAnchorValue(anchor.x), y: asAnchorValue(anchor.y) },
        offset: {
          x: asFiniteNumber(offset.x, 0, -2, 2),
          y: asFiniteNumber(offset.y, 0, -2, 2),
        },
        fontSizeRatio: asRanged(r.fontSizeRatio, WATERMARK_RANGES.fontSizeRatio),
        rectW: asRanged(r.rectW, WATERMARK_RANGES.rectW),
        rectH: asRanged(r.rectH, WATERMARK_RANGES.rectH),
        rectRadius: asRanged(r.rectRadius, WATERMARK_RANGES.rectRadius),
        opacity: asRanged(r.opacity, WATERMARK_RANGES.opacity),
        color,
        fontId: FONT_BY_ID.has(r.fontId as string)
          ? (r.fontId as WatermarkFontId)
          : DEFAULT_WATERMARK_FONT,
        stroke: r.stroke === true,
      }),
    );
  }
  return out;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * photos.watermark_text に記録する JSON 文字列を生成する。
 * 「どんな透かしが焼かれたか」の記録用 (要件 R14 / Q8-B)。
 */
export function serializeWatermark(elements: WatermarkRenderElement[]): string {
  return JSON.stringify({
    v: 1,
    elements: elements.map((el) =>
      el.kind === "rect"
        ? {
            kind: "rect",
            w: round3(el.rectW),
            h: round3(el.rectH),
            radius: round3(el.rectRadius),
            opacity: round3(el.opacity),
            color: el.color,
            anchor: [el.anchor.x, el.anchor.y],
            offset: [round3(el.offset.x), round3(el.offset.y)],
          }
        : {
            kind: "text",
            text: el.text,
            font: el.fontId,
            size: round3(el.fontSizeRatio),
            opacity: round3(el.opacity),
            color: el.color,
            stroke: el.stroke,
            anchor: [el.anchor.x, el.anchor.y],
            offset: [round3(el.offset.x), round3(el.offset.y)],
          },
    ),
  });
}

// ========== レイアウト (配置・クランプ) ==========

export type WatermarkElementLayout = {
  id: string;
  /** ブロック中心 (クランプ適用後、キャンバス座標) */
  cx: number;
  cy: number;
  /** ブロック矩形 */
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  lines: string[];
};

export type MeasureLineFn = (line: string, fontId: WatermarkFontId, fontSizePx: number) => number;

/**
 * 座標系の核: 要素中心 = anchor × キャンバス寸法 + offset × 長辺。
 * レイアウトとエディタ (ドラッグ) の双方がこれを使い、変換式を一箇所に保つ。
 */
export function watermarkElementCenter(
  el: Pick<WatermarkRenderElement, "anchor" | "offset">,
  canvasW: number,
  canvasH: number,
): { cx: number; cy: number } {
  const long = Math.max(canvasW, canvasH);
  return {
    cx: el.anchor.x * canvasW + el.offset.x * long,
    cy: el.anchor.y * canvasH + el.offset.y * long,
  };
}

type OverlapRect = { left: number; right: number; top: number; bottom: number };

/**
 * 矩形の重なりで推移的にクラスタリングし、インデックスのグループを返す (union-find)。
 * 近接判定は呼び出し側で矩形をマージン分膨らませてから渡す。n ≤ 5 なので総当たりで十分。
 */
function clusterByOverlap(rects: OverlapRect[]): number[][] {
  const n = rects.length;
  const parent = rects.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = rects[i];
      const b = rects[j];
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
        parent[find(i)] = find(j);
      }
    }
  }
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const list = clusters.get(root);
    if (list) list.push(i);
    else clusters.set(root, [i]);
  }
  return [...clusters.values()];
}

/** 近接クラスタ判定に使う、フォントサイズの半分だけ膨らませた矩形 */
function expandedRect(it: {
  cx: number;
  cy: number;
  width: number;
  height: number;
  fontSize: number;
}): OverlapRect {
  const m = it.fontSize * 0.5;
  return {
    left: it.cx - it.width / 2 - m,
    right: it.cx + it.width / 2 + m,
    top: it.cy - it.height / 2 - m,
    bottom: it.cy + it.height / 2 + m,
  };
}

/**
 * 各要素の描画位置を計算する (純粋関数)。
 * 1. アンカー + 長辺比オフセットで中心を求める
 * 2. はみ出す要素は内側へ押し戻す (クランプ)。クランプは**要素ごとに完全に独立**で、
 *    ある要素を端に押し付けても他の要素は 1px も動かない (直接操作の予測可能性を優先)。
 *    近接クラスタはアンカー共有 (縦横比間の追従) にのみ使い、クランプには使わない。
 *    そのため縦横比の違う写真では、同じ角に押し込まれた要素同士が重なることはあり得る
 * 3. ブロックがキャンバスより大きい場合は中央寄せ
 */
export function layoutWatermarkElements(
  canvasW: number,
  canvasH: number,
  elements: WatermarkRenderElement[],
  measureLine: MeasureLineFn,
): WatermarkElementLayout[] {
  const long = Math.max(canvasW, canvasH);
  const items = elements
    .filter((el) => el.kind === "rect" || el.text.trim().length > 0)
    .map((el) => {
      const { cx, cy } = watermarkElementCenter(el, canvasW, canvasH);
      if (el.kind === "rect") {
        // rect は fontSize=0 → クランプ余白 0 (端にぴったり付けられる)
        return {
          el,
          fontSize: 0,
          lines: [] as string[],
          lineHeight: 0,
          width: Math.max(8, el.rectW * long),
          height: Math.max(8, el.rectH * long),
          cx,
          cy,
        };
      }
      const fontSize = Math.max(12, Math.round(long * el.fontSizeRatio));
      const lines = el.text.split("\n");
      const lineHeight = Math.round(fontSize * 1.25);
      const width = Math.max(1, ...lines.map((l) => measureLine(l, el.fontId, fontSize)));
      const height = lineHeight * lines.length;
      return { el, fontSize, lines, lineHeight, width, height, cx, cy };
    });

  // 要素ごとに独立してクランプ (他の要素の位置には一切影響しない)
  for (const g of items) {
    const pad = Math.round(0.5 * g.fontSize);
    if (g.width > canvasW - pad * 2) g.cx = canvasW / 2;
    else if (g.cx - g.width / 2 < pad) g.cx = pad + g.width / 2;
    else if (g.cx + g.width / 2 > canvasW - pad) g.cx = canvasW - pad - g.width / 2;
    if (g.height > canvasH - pad * 2) g.cy = canvasH / 2;
    else if (g.cy - g.height / 2 < pad) g.cy = pad + g.height / 2;
    else if (g.cy + g.height / 2 > canvasH - pad) g.cy = canvasH - pad - g.height / 2;
  }

  return items.map((g) => ({
    id: g.el.id,
    cx: g.cx,
    cy: g.cy,
    left: g.cx - g.width / 2,
    top: g.cy - g.height / 2,
    width: g.width,
    height: g.height,
    fontSize: g.fontSize,
    lineHeight: g.lineHeight,
    lines: g.lines,
  }));
}

// ========== アンカー導出 (エディタ側) ==========

export type WatermarkPlacementInput = {
  id: string;
  /** 要素中心 (キャンバス座標) */
  cx: number;
  cy: number;
  /** ブロック矩形サイズ */
  width: number;
  height: number;
  fontSize: number;
};

export type WatermarkPlacement = {
  anchor: { x: WatermarkAnchorValue; y: WatermarkAnchorValue };
  offset: { x: number; y: number };
};

const snapAnchor = (t: number): WatermarkAnchorValue => (t < 1 / 3 ? 0 : t < 2 / 3 ? 0.5 : 1);

/**
 * 要素の絶対位置からアンカー + オフセットを導出する (純粋関数)。
 *
 * 近接グループ化ヒューリスティック: bbox をフォントサイズの半分だけ膨らませて
 * 重なる要素同士を同一クラスタとし、クラスタの union bbox の中心で最寄りアンカーを
 * 決めて共有する。近くに置いた要素は縦横比が変わっても相対配置が保たれ、
 * 離して置いた要素は独立に追従する。
 */
export function deriveAnchorPlacement(
  canvasW: number,
  canvasH: number,
  items: WatermarkPlacementInput[],
): Map<string, WatermarkPlacement> {
  const long = Math.max(canvasW, canvasH);

  const result = new Map<string, WatermarkPlacement>();
  // クラスタごとに union bbox の中心で最寄りアンカーを決定し、メンバーで共有する
  for (const indices of clusterByOverlap(items.map(expandedRect))) {
    const members = indices.map((i) => items[i]);
    const left = Math.min(...members.map((m) => m.cx - m.width / 2));
    const right = Math.max(...members.map((m) => m.cx + m.width / 2));
    const top = Math.min(...members.map((m) => m.cy - m.height / 2));
    const bottom = Math.max(...members.map((m) => m.cy + m.height / 2));
    const anchor = {
      x: snapAnchor((left + right) / 2 / canvasW),
      y: snapAnchor((top + bottom) / 2 / canvasH),
    };
    for (const m of members) {
      result.set(m.id, {
        anchor,
        offset: {
          x: (m.cx - anchor.x * canvasW) / long,
          y: (m.cy - anchor.y * canvasH) / long,
        },
      });
    }
  }
  return result;
}

// ========== 描画 ==========

type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** #rrggbb の相対輝度 (0-255, Rec.601) */
function hexLuminance(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** 描画領域の平均輝度 (0-255, Rec.601)。領域はキャンバス内にクリップする */
function meanLuminance(
  ctx: Ctx2D,
  canvasW: number,
  canvasH: number,
  box: { left: number; top: number; width: number; height: number },
): number {
  const x = Math.max(0, Math.floor(box.left));
  const y = Math.max(0, Math.floor(box.top));
  const w = Math.max(1, Math.min(Math.ceil(box.width), canvasW - x));
  const h = Math.max(1, Math.min(Math.ceil(box.height), canvasH - y));
  const data = ctx.getImageData(x, y, w, h).data;
  let total = 0;
  let count = 0;
  // 明暗の閾値判定なので全画素は不要。4px おきに間引いてサンプリングする
  // (ドラッグ中は再描画のたびに走るホットパス)
  for (let i = 0; i < data.length; i += 16) {
    total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    count++;
  }
  return count === 0 ? 128 : total / count;
}

/** 要素の色指定を実際の描画色に解決する (パレットは背景輝度で明暗を自動選択) */
function resolveFillColor(
  ctx: Ctx2D,
  canvasW: number,
  canvasH: number,
  layout: WatermarkElementLayout,
  color: string,
): string {
  const palette = getWatermarkPalette(color);
  if (!palette) return isCustomWatermarkColor(color) ? color : "#ffffff";
  return meanLuminance(ctx, canvasW, canvasH, layout) < 128 ? palette.light : palette.dark;
}

/**
 * 透かし要素群を Canvas に描画し、各要素のレイアウト (クランプ後の矩形) を返す。
 * 返り値はプレビューのヒットテスト・選択枠表示に使う。
 * フォントは事前に ensureWatermarkFonts でロード済みであること。
 */
export function drawWatermarkElements(
  ctx: Ctx2D,
  canvasW: number,
  canvasH: number,
  elements: WatermarkRenderElement[],
): WatermarkElementLayout[] {
  const measure: MeasureLineFn = (line, fontId, fontSizePx) => {
    ctx.font = watermarkCtxFont(fontId, fontSizePx);
    return ctx.measureText(line).width;
  };
  const layouts = layoutWatermarkElements(canvasW, canvasH, elements, measure);
  const layoutById = new Map(layouts.map((l) => [l.id, l]));

  // rect → text の順に描く (四角形は常に文字の下地)。テキストの自動色は
  // 描画済みの四角形の上をサンプリングするので、下地に対するコントラストが自動で決まる
  for (const el of watermarkDrawOrder(elements)) {
    const layout = layoutById.get(el.id);
    if (!layout) continue;
    const fill = resolveFillColor(ctx, canvasW, canvasH, layout, el.color);
    ctx.save();
    ctx.globalAlpha = el.opacity;
    ctx.fillStyle = fill;
    if (el.kind === "rect") {
      const radius = Math.min(layout.width, layout.height) * el.rectRadius;
      roundedRectPath(ctx, layout.left, layout.top, layout.width, layout.height, radius);
      ctx.fill();
      ctx.restore();
      continue;
    }
    ctx.font = watermarkCtxFont(el.fontId, layout.fontSize);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (el.stroke) {
      ctx.strokeStyle = hexLuminance(fill) < 128 ? "#ffffff" : "#000000";
      ctx.lineWidth = Math.max(1, layout.fontSize * 0.08);
      ctx.lineJoin = "round";
    }
    const firstY = layout.cy - layout.height / 2 + layout.lineHeight / 2;
    layout.lines.forEach((line, i) => {
      const ly = firstY + layout.lineHeight * i;
      if (el.stroke) ctx.strokeText(line, layout.cx, ly);
      ctx.fillText(line, layout.cx, ly);
    });
    ctx.restore();
  }
  return layouts;
}

/** 角丸矩形のパスを作る (ctx.roundRect 未対応環境は直角矩形にフォールバック) */
function roundedRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}
