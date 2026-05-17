import { describe, expect, it } from "vitest";
import { runConcurrent } from "../../src/lib/concurrency";

describe("runConcurrent", () => {
  // 目的: アップロード並列実行の核となる関数の挙動全般 (本番では Promise.allSettled 互換で使われる)
  it("全件処理し、結果が入力と同じ順序で返る (アップロード結果の並び崩れ防止)", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await runConcurrent(items, 2, async (n) => n * 10);
    expect(results.map((r) => r.status === "fulfilled" && r.value)).toEqual([10, 20, 30, 40, 50]);
  });

  it("同時実行数が limit を越えない (R2 が並列爆発しないことの担保)", async () => {
    const concurrent: number[] = [];
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    await runConcurrent(items, 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      concurrent.push(inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("一部が失敗しても全体は完走し、失敗は rejected として入力順に返る (部分失敗のリトライ UI 用)", async () => {
    const results = await runConcurrent([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("fail-2");
      return n;
    });
    expect(results[0]).toEqual({ status: "fulfilled", value: 1 });
    expect(results[1].status).toBe("rejected");
    expect((results[1] as PromiseRejectedResult).reason.message).toBe("fail-2");
    expect(results[2]).toEqual({ status: "fulfilled", value: 3 });
  });

  it("limit が items 数より大きくても worker は items 数に抑えられる (空回りワーカー防止)", async () => {
    const results = await runConcurrent([1, 2], 100, async (n) => n);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ status: "fulfilled", value: 1 });
  });

  it("空配列を渡しても例外なく即座に空結果を返す (ファイル選択 0 件のフロー保護)", async () => {
    const results = await runConcurrent([], 5, async (n: number) => n);
    expect(results).toEqual([]);
  });
});
