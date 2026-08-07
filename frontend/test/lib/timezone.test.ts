import { describe, expect, it } from "vitest";
import { buildDateKeyAndLabel } from "../../src/lib/timezone";

// 目的: ギャラリーの日付見出しとサーバー集計 (date_counts) のキーが一致すること。
// サーバー側は strftime('%Y-%m-%d', datetime(created_at + tz_offset_min*60, 'unixepoch'))
// で同じキーを作る。フィクスチャは workers/test/receiver-photos.test.ts と同一にしてあり、
// 両者が同じ期待値を持つことでクロスレイヤの一致をロックしている。
describe("buildDateKeyAndLabel", () => {
  // 2026-01-15 20:00 UTC
  const createdAt = Date.UTC(2026, 0, 15, 20, 0, 0) / 1000;

  it("正のオフセット (JST +540) で日境界を越えた翌日のキーになる", () => {
    expect(buildDateKeyAndLabel(createdAt, 540).key).toBe("2026-01-16");
  });

  it("負のオフセット (ハワイ -600) では同日のキーになる", () => {
    expect(buildDateKeyAndLabel(createdAt, -600).key).toBe("2026-01-15");
  });

  it("オフセットの上下限 (-720 / +840) でも破綻しない", () => {
    expect(buildDateKeyAndLabel(createdAt, -720).key).toBe("2026-01-15");
    expect(buildDateKeyAndLabel(createdAt, 840).key).toBe("2026-01-16");
  });

  it("月・年の境界をまたいでも正しく繰り上がる", () => {
    // 2025-12-31 20:00 UTC → JST では 2026-01-01
    const newYearEve = Date.UTC(2025, 11, 31, 20, 0, 0) / 1000;
    expect(buildDateKeyAndLabel(newYearEve, 540).key).toBe("2026-01-01");
    expect(buildDateKeyAndLabel(newYearEve, -600).key).toBe("2025-12-31");
  });

  it("うるう年の 2/29 を正しく扱う", () => {
    // 2028-02-28 20:00 UTC → JST では 2028-02-29 (2028 はうるう年)
    const leap = Date.UTC(2028, 1, 28, 20, 0, 0) / 1000;
    expect(buildDateKeyAndLabel(leap, 540).key).toBe("2028-02-29");
  });

  it("label はキーと同じ日付を / 区切りで表す (見出し表示用)", () => {
    expect(buildDateKeyAndLabel(createdAt, 540).label).toBe("2026/01/16");
  });
});
