import { describe, expect, it } from "vitest";
import { formatBytes, formatDate } from "../../src/lib/format";

describe("formatBytes", () => {
  // 目的: ストレージ使用量表示で 0/KB/MB/GB/TB の各単位境界が想定通り切り替わる
  it("0 バイトは '0 B' を返す (空ストレージ時の表示崩れ防止)", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("KB / MB / GB / TB の単位境界で正しい単位とスケールに切り替わる", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
    expect(formatBytes(1024 ** 4)).toBe("1.0 TB");
  });

  it("非整数バイトは小数点第 1 位までに丸める (ダッシュボードのプログレスバー横の値表示)", () => {
    expect(formatBytes(1536)).toBe("1.5 KB"); // 1.5 * 1024
    expect(formatBytes(1024 * 1024 * 2.3)).toBe("2.3 MB");
  });

  it("バイト未満 (1 以上 1024 未満) は単位 B のまま整数表示", () => {
    expect(formatBytes(1)).toBe("1 B");
    expect(formatBytes(512)).toBe("512 B");
  });
});

describe("formatDate", () => {
  // 目的: 削除予定日 (R13) の表示。時刻は出さない — 実際の削除は毎時の Cron 任せで
  // 分単位の保証がなく、時刻まで見せると誤解を招くため
  const unix = Date.UTC(2026, 9, 7, 3, 0, 0) / 1000;

  it("年月日だけを返し、時刻を含まない", () => {
    const formatted = formatDate(unix, "ja-JP");
    expect(formatted).toContain("2026");
    expect(formatted).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("ロケールごとの並びに従う", () => {
    expect(formatDate(unix, "ja-JP")).toMatch(/^2026/);
    expect(formatDate(unix, "en-US")).toMatch(/2026$/);
  });
});
