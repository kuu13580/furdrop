import { describe, expect, it } from "vitest";
import { isQuotaFull, usagePercent } from "../../src/lib/quota";

const GB = 1024 ** 3;

describe("usagePercent", () => {
  it("quota が 0 でも NaN / Infinity を返さない (未登録直後の表示崩れ防止)", () => {
    expect(usagePercent(0, 0)).toBe(0);
    expect(usagePercent(100, 0)).toBe(0);
  });

  it("使用量に応じた百分率を返す", () => {
    expect(usagePercent(5 * GB, 10 * GB)).toBe(50);
    expect(usagePercent(10 * GB, 10 * GB)).toBe(100);
  });
});

describe("isQuotaFull", () => {
  // 目的: 「受け取れません」と断定してよい境界をサーバーと揃える。
  // サーバーは storage_used >= storage_quota でしか受付を止めないので、
  // 危険域 (95%) を満杯扱いすると UI が嘘をつく
  it("95% は満杯ではない (まだ受け取れる)", () => {
    expect(isQuotaFull(9.5 * GB, 10 * GB)).toBe(false);
    expect(isQuotaFull(10 * GB - 1, 10 * GB)).toBe(false);
  });

  it("上限に達したら満杯", () => {
    expect(isQuotaFull(10 * GB, 10 * GB)).toBe(true);
    expect(isQuotaFull(11 * GB, 10 * GB)).toBe(true);
  });
});
