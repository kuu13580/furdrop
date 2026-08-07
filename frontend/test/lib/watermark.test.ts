import { describe, expect, it } from "vitest";
import {
  createDefaultWatermarkElements,
  createWatermarkElement,
  createWatermarkRectElement,
  deriveAnchorPlacement,
  layoutWatermarkElements,
  MAX_WATERMARK_ELEMENTS,
  type MeasureLineFn,
  resolveWatermarkElements,
  sanitizeWatermarkElements,
  serializeWatermark,
  type WatermarkRenderElement,
  watermarkDrawOrder,
} from "../../src/lib/watermark";

/** 1文字 = fontSize/2 px の単純な幅モデル (Canvas 不要のテスト用) */
const fakeMeasure: MeasureLineFn = (line, _fontId, fontSizePx) => (line.length * fontSizePx) / 2;

const renderEl = (partial: Partial<WatermarkRenderElement>): WatermarkRenderElement => {
  const { autoText: _autoText, ...el } = createWatermarkElement(partial as never);
  return { ...el, ...partial };
};

describe("resolveWatermarkElements", () => {
  // 目的: autoText 要素のクレジット解決と空テキスト要素の除外 (描画・送信対象の確定)

  it("autoText 要素はクレジット文字列に解決される", () => {
    const [el] = createDefaultWatermarkElements();
    const resolved = resolveWatermarkElements([el], "撮影：hanako");
    expect(resolved).toHaveLength(1);
    expect(resolved[0].text).toBe("撮影：hanako");
  });

  it("autoText でクレジットが空、および手入力の空テキスト要素は除外される", () => {
    const auto = createWatermarkElement({ autoText: true });
    const manual = createWatermarkElement({ text: "   " });
    const kept = createWatermarkElement({ text: "#event" });
    const resolved = resolveWatermarkElements([auto, manual, kept], "");
    expect(resolved.map((e) => e.text)).toEqual(["#event"]);
  });

  it("手入力テキストはクレジットに影響されずそのまま使われる", () => {
    const el = createWatermarkElement({ text: "桜まつり2026", autoText: false });
    const resolved = resolveWatermarkElements([el], "撮影：hanako");
    expect(resolved[0].text).toBe("桜まつり2026");
  });

  it("rect 要素はテキストを持たないが常に描画対象として残る", () => {
    const rect = createWatermarkRectElement();
    const resolved = resolveWatermarkElements([rect], "");
    expect(resolved).toHaveLength(1);
    expect(resolved[0].kind).toBe("rect");
  });
});

describe("watermarkDrawOrder", () => {
  // 目的: 四角形は常にテキストの背面 (先) に描画される固定ルール

  it("rect が先、text が後になり、同種内は元の順序を保つ", () => {
    const t1 = createWatermarkElement({ id: "t1", text: "a" });
    const r1 = createWatermarkRectElement({ id: "r1" });
    const t2 = createWatermarkElement({ id: "t2", text: "b" });
    const r2 = createWatermarkRectElement({ id: "r2" });
    expect(watermarkDrawOrder([t1, r1, t2, r2]).map((e) => e.id)).toEqual(["r1", "r2", "t1", "t2"]);
  });
});

describe("sanitizeWatermarkElements", () => {
  // 目的: localStorage 復元値の検証 (破損・旧形式・不正値をデフォルトへフォールバック)

  it("配列以外・要素がオブジェクト以外なら空配列を返す", () => {
    expect(sanitizeWatermarkElements(undefined)).toEqual([]);
    expect(sanitizeWatermarkElements("junk")).toEqual([]);
    expect(sanitizeWatermarkElements([1, "a", null])).toEqual([]);
  });

  it("正常な要素はラウンドトリップで保たれる", () => {
    const el = createWatermarkElement({
      text: "#event",
      anchor: { x: 1, y: 0.5 },
      offset: { x: -0.1, y: 0.05 },
      fontSizeRatio: 0.03,
      opacity: 0.6,
      color: "coral",
      fontId: "dela-gothic",
      stroke: true,
    });
    const [restored] = sanitizeWatermarkElements(JSON.parse(JSON.stringify([el])));
    expect(restored).toEqual(el);
  });

  it("不正なフィールドはデフォルトへフォールバックし、範囲外の数値はクランプされる", () => {
    const [restored] = sanitizeWatermarkElements([
      {
        text: 123,
        anchor: { x: 0.7, y: "top" },
        offset: { x: 99, y: Number.NaN },
        fontSizeRatio: 5,
        opacity: -1,
        color: "#GGGGGG",
        fontId: "unknown-font",
        stroke: "yes",
      },
    ]);
    expect(restored.text).toBe("");
    expect(restored.anchor).toEqual({ x: 0.5, y: 0.5 });
    expect(restored.offset).toEqual({ x: 2, y: 0 });
    expect(restored.fontSizeRatio).toBe(0.15);
    expect(restored.opacity).toBe(0.1);
    expect(restored.color).toBe("mono");
    expect(restored.fontId).toBe("noto-sans");
    expect(restored.stroke).toBe(false);
  });

  it("rect 要素もラウンドトリップで保たれる", () => {
    const rect = createWatermarkRectElement({
      rectW: 0.6,
      rectH: 0.25,
      rectRadius: 0,
      color: "sky",
      anchor: { x: 0.5, y: 1 },
      offset: { x: 0.1, y: -0.02 },
    });
    const [restored] = sanitizeWatermarkElements(JSON.parse(JSON.stringify([rect])));
    expect(restored).toEqual(rect);
  });

  it("上限 (5要素) を超える分は切り捨てられる", () => {
    const many = Array.from({ length: 8 }, (_, i) => createWatermarkElement({ text: `${i}` }));
    expect(sanitizeWatermarkElements(many)).toHaveLength(MAX_WATERMARK_ELEMENTS);
  });
});

describe("serializeWatermark", () => {
  // 目的: photos.watermark_text へ記録する JSON の形 (R14 記録用、Q8-B)

  it("text 要素はバージョンつき JSON で全パラメータが記録される", () => {
    const el = renderEl({
      text: "撮影：hanako",
      anchor: { x: 1, y: 1 },
      offset: { x: -0.0333333, y: -0.02 },
      color: "#ff0000",
      stroke: true,
    });
    const parsed = JSON.parse(serializeWatermark([el]));
    expect(parsed.v).toBe(1);
    expect(parsed.elements).toHaveLength(1);
    expect(parsed.elements[0]).toEqual({
      kind: "text",
      text: "撮影：hanako",
      font: "noto-sans",
      size: 0.02,
      opacity: 0.8,
      color: "#ff0000",
      stroke: true,
      anchor: [1, 1],
      offset: [-0.033, -0.02],
    });
  });

  it("rect 要素はサイズ・角丸を含む形で記録される", () => {
    const { autoText: _a, ...rect } = createWatermarkRectElement({
      rectW: 0.5,
      rectH: 0.2,
      rectRadius: 0.3,
      anchor: { x: 0.5, y: 1 },
      offset: { x: 0, y: -0.05 },
    });
    const parsed = JSON.parse(serializeWatermark([rect]));
    expect(parsed.elements[0]).toEqual({
      kind: "rect",
      w: 0.5,
      h: 0.2,
      radius: 0.3,
      opacity: 0.5,
      color: "#ffffff",
      anchor: [0.5, 1],
      offset: [0, -0.05],
    });
  });
});

describe("layoutWatermarkElements", () => {
  // 目的: アンカー + 長辺比オフセットの配置と、写真ごとの bbox クランプ (はみ出し防止)

  it("アンカー(1,1) + 負オフセットの要素が右下に配置される", () => {
    const el = renderEl({
      text: "credit",
      anchor: { x: 1, y: 1 },
      offset: { x: -0.2, y: -0.1 },
      fontSizeRatio: 0.02,
    });
    const [layout] = layoutWatermarkElements(1000, 500, [el], fakeMeasure);
    expect(layout.cx).toBe(1000 - 0.2 * 1000);
    expect(layout.cy).toBe(500 - 0.1 * 1000);
  });

  it("キャンバス外にはみ出す要素は内側へ押し戻される (クランプ)", () => {
    const el = renderEl({
      text: "long-credit-text",
      anchor: { x: 1, y: 1 },
      offset: { x: 0.5, y: 0.5 }, // 完全に右下の外
      fontSizeRatio: 0.02,
    });
    const [layout] = layoutWatermarkElements(1000, 500, [el], fakeMeasure);
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.top).toBeGreaterThanOrEqual(0);
    expect(layout.left + layout.width).toBeLessThanOrEqual(1000);
    expect(layout.top + layout.height).toBeLessThanOrEqual(500);
  });

  it("クランプは要素ごとに独立で、重なるほど近くても他要素を動かさない (端への押し付けで浮かない)", () => {
    // 下端ギリギリの inside に、pushed を重なる位置まで押し付けるケース
    // (近接クラスタとしてアンカーは共有し得るが、クランプでは道連れにならない)
    const inside = renderEl({
      id: "inside",
      text: "credit",
      anchor: { x: 0.5, y: 1 },
      offset: { x: 0, y: -0.06 }, // 下辺の内側 (自身のクランプ余白にも掛からない)
    });
    const pushed = renderEl({
      id: "pushed",
      text: "pushed",
      anchor: { x: 0.5, y: 1 },
      offset: { x: 0.01, y: 0.3 }, // inside のすぐ下から大きくはみ出し (クランプ対象)
    });
    const layouts = layoutWatermarkElements(1000, 500, [inside, pushed], fakeMeasure);
    const li = layouts.find((l) => l.id === "inside");
    const lp = layouts.find((l) => l.id === "pushed");
    if (!li || !lp) throw new Error("layout missing");
    // pushed は写真内へ押し戻される
    expect(lp.top + lp.height).toBeLessThanOrEqual(500);
    // inside は道連れに動かず、元の位置のまま
    expect(li.cy).toBeCloseTo(500 - 0.06 * 1000, 5);
    expect(li.cx).toBeCloseTo(500, 5);
  });

  it("キャンバスより大きいブロックは中央寄せになる", () => {
    const el = renderEl({
      text: "x".repeat(200),
      anchor: { x: 0, y: 0 },
      offset: { x: 0, y: 0 },
      fontSizeRatio: 0.08,
    });
    const [layout] = layoutWatermarkElements(400, 400, [el], fakeMeasure);
    expect(layout.cx).toBeCloseTo(200, 5);
  });

  it("空テキスト要素はレイアウト対象外", () => {
    const el = renderEl({ text: "  " });
    expect(layoutWatermarkElements(1000, 500, [el], fakeMeasure)).toEqual([]);
  });

  it("rect 要素は長辺比のサイズで配置され、余白なしで端にぴったり付けられる", () => {
    const { autoText: _a, ...rect } = createWatermarkRectElement({
      rectW: 0.5,
      rectH: 0.1,
      anchor: { x: 0.5, y: 1 },
      offset: { x: 0, y: 0.5 }, // 下へ大きくはみ出し → 下端フラッシュにクランプ
    });
    const [layout] = layoutWatermarkElements(1000, 500, [rect], fakeMeasure);
    expect(layout.width).toBe(500); // 0.5 * 長辺1000
    expect(layout.height).toBe(100); // 0.1 * 長辺1000
    // rect のクランプ余白は 0 (端に密着できる)
    expect(layout.top + layout.height).toBe(500);
  });
});

describe("deriveAnchorPlacement", () => {
  // 目的: ドラッグ位置からのアンカー吸着と近接グループ化ヒューリスティック (Q6/Q7 の要)

  it("右下に置いた要素は (1,1) アンカーへ吸着し、オフセットから元の中心を復元できる", () => {
    const placements = deriveAnchorPlacement(1000, 500, [
      { id: "a", cx: 900, cy: 450, width: 100, height: 30, fontSize: 20 },
    ]);
    const p = placements.get("a");
    if (!p) throw new Error("placement missing");
    expect(p.anchor).toEqual({ x: 1, y: 1 });
    expect(p.anchor.x * 1000 + p.offset.x * 1000).toBeCloseTo(900, 5);
    expect(p.anchor.y * 500 + p.offset.y * 1000).toBeCloseTo(450, 5);
  });

  it("近接する 2 要素は境界をまたいでも同じアンカーを共有する (近接グループ化)", () => {
    // a は中央寄り (x=630 → 単独なら 0.5 アンカー)、b は右寄り (x=700 → 単独なら 1)。
    // bbox が重なる近接ペアなので、union bbox の中心でアンカーが統一される。
    const placements = deriveAnchorPlacement(1000, 500, [
      { id: "a", cx: 630, cy: 250, width: 120, height: 30, fontSize: 20 },
      { id: "b", cx: 700, cy: 250, width: 120, height: 30, fontSize: 20 },
    ]);
    expect(placements.get("a")?.anchor).toEqual(placements.get("b")?.anchor);
  });

  it("離れた 2 要素は独立したアンカーに吸着する", () => {
    const placements = deriveAnchorPlacement(1000, 500, [
      { id: "a", cx: 100, cy: 450, width: 100, height: 30, fontSize: 20 },
      { id: "b", cx: 900, cy: 450, width: 100, height: 30, fontSize: 20 },
    ]);
    expect(placements.get("a")?.anchor).toEqual({ x: 0, y: 1 });
    expect(placements.get("b")?.anchor).toEqual({ x: 1, y: 1 });
  });
});
