import { describe, expect, it } from "vitest";
import { formatBytes } from "../../src/lib/format";

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
