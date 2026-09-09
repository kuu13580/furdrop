import { describe, expect, it } from "vitest";
import { sanitizePath } from "../../src/lib/analytics";

// 目的: GA に送る page_location から、送信URLのアクセスキー (R16) と個別識別子が
// 落ちていること。ここが崩れると受信者のハンドルや photoId が GA に蓄積される。
describe("sanitizePath", () => {
  it("handle / photoId を * にマスクする (個別識別子を GA に送らない)", () => {
    expect(sanitizePath("/send/taro_camera")).toBe("/send/*");
    expect(sanitizePath("/send/taro_camera/upload")).toBe("/send/*/upload");
    expect(sanitizePath("/gallery/0f3c9b1e-1234-4a5b-8c7d-9e0f1a2b3c4d")).toBe("/gallery/*");
  });

  it("既知の静的パスはそのまま残す (レポートが読めなくならない)", () => {
    for (const p of [
      "/",
      "/login",
      "/dashboard",
      "/gallery",
      "/settings",
      "/terms",
      // R09。トークンはクエリなので pathname には出ない
      "/verify-email",
      "/unsubscribe",
    ]) {
      expect(sanitizePath(p)).toBe(p);
    }
  });

  // 許可リスト方式の肝。除外リストだと、識別子を含む新ルートを足した瞬間に素通しになる。
  it("未知のルートは値を残さず * に潰す (新ルート追加時に fail-closed)", () => {
    expect(sanitizePath("/invite/9f2c-secret-token")).toBe("/*/*");
    expect(sanitizePath("/album/42")).toBe("/*/*");
  });

  it("クエリやハッシュを渡されても値を残さない (呼び出し側が誤って渡した場合の保険)", () => {
    expect(sanitizePath("/send/taro?k=SECRET")).toBe("/send/*");
    expect(sanitizePath("/gallery/abc#frag")).toBe("/gallery/*");
  });
});
