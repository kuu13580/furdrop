import { describe, expect, it } from "vitest";
import { withKey } from "../../src/lib/send-url";

describe("withKey", () => {
  // 目的: R16 アクセスキー (?k=) の引き回しが正しく動き、認可が破綻しないこと

  it("key が null/undefined/空文字ならパスをそのまま返す (キー未取得時のリロード保護)", () => {
    expect(withKey("/send/taro", null)).toBe("/send/taro");
    expect(withKey("/send/taro", undefined)).toBe("/send/taro");
    expect(withKey("/send/taro", "")).toBe("/send/taro");
  });

  it("key を ?k= で付与する (Landing → Upload → Uploading → Done の遷移で常時保持)", () => {
    expect(withKey("/send/taro/upload", "V1StGXR8")).toBe("/send/taro/upload?k=V1StGXR8");
  });

  it("key に URL 予約文字が含まれていても encodeURIComponent で安全に乗る", () => {
    expect(withKey("/send/taro", "a b&c=d")).toBe("/send/taro?k=a%20b%26c%3Dd");
  });
});
