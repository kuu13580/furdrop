import { describe, expect, it } from "vitest";
import { formatCredit } from "../../src/lib/image-processing";

describe("formatCredit", () => {
  // 目的: EXIF / 透かしに埋め込むクレジット文字列のフォーマット
  // (受信者が選択する 4 種を全て担保。送信者名の前後空白がそのまま画像に焼き付かないことも保証)

  it("送信者名が空ならフォーマット種別に関わらず空文字 (空 EXIF を防ぐ)", () => {
    expect(formatCredit("", "shot_by")).toBe("");
    expect(formatCredit("   ", "photo_by")).toBe("");
    expect(formatCredit("\t\n", "copyright")).toBe("");
  });

  it("4 種のフォーマットそれぞれが想定のテンプレートで出力される", () => {
    expect(formatCredit("hanako", "shot_by")).toBe("撮影：hanako");
    expect(formatCredit("hanako", "photo_by")).toBe("Photo by hanako");
    expect(formatCredit("hanako", "copyright")).toBe("© hanako");
    expect(formatCredit("hanako", "name_only")).toBe("hanako");
  });

  it("前後の空白はトリムされてからテンプレートに差し込まれる (画像に空白が焼き付かない)", () => {
    expect(formatCredit("  @hanako_photo  ", "shot_by")).toBe("撮影：@hanako_photo");
  });

  it("引数省略時は shot_by がデフォルト (UI で未選択時のフォールバック)", () => {
    expect(formatCredit("alice")).toBe("撮影：alice");
  });
});
