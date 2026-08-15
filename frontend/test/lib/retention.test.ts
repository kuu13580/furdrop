import { describe, expect, it } from "vitest";
import { daysUntilExpiry, expiryBadgeLevel } from "../../src/lib/retention";

// 目的: 削除予告の「残りN日」とバッジ色が、期限のどちら側にいても破綻しないこと。
// 期限を過ぎた写真は Cron が次に回るまで残るため、負の日数を出さないことが要件。
const NOW_MS = Date.UTC(2026, 7, 15, 12, 0, 0);
const nowSec = NOW_MS / 1000;
const DAY = 86400;

describe("daysUntilExpiry", () => {
  it("残り日数を切り上げる (あと数時間なら 1 日として扱う)", () => {
    expect(daysUntilExpiry(nowSec + 3 * DAY, NOW_MS)).toBe(3);
    expect(daysUntilExpiry(nowSec + 2 * DAY + 3600, NOW_MS)).toBe(3);
    expect(daysUntilExpiry(nowSec + 3600, NOW_MS)).toBe(1);
  });

  it("期限を過ぎていても負の値を返さない (Cron 未回収の猶予)", () => {
    expect(daysUntilExpiry(nowSec - 10 * DAY, NOW_MS)).toBe(0);
    expect(daysUntilExpiry(nowSec, NOW_MS)).toBe(0);
  });
});

describe("expiryBadgeLevel", () => {
  it("残り 14 日以内で warn、3 日以内で danger になる", () => {
    expect(expiryBadgeLevel(nowSec + 14 * DAY, NOW_MS)).toBe("warn");
    expect(expiryBadgeLevel(nowSec + 4 * DAY, NOW_MS)).toBe("warn");
    expect(expiryBadgeLevel(nowSec + 3 * DAY, NOW_MS)).toBe("danger");
    expect(expiryBadgeLevel(nowSec - DAY, NOW_MS)).toBe("danger");
  });

  it("残りが十分あればバッジを出さない", () => {
    expect(expiryBadgeLevel(nowSec + 15 * DAY, NOW_MS)).toBeNull();
    expect(expiryBadgeLevel(nowSec + 180 * DAY, NOW_MS)).toBeNull();
  });
});
