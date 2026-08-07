import { describe, expect, it } from "vitest";
import { ApiError, resolveApiError, resolveAuthError } from "../../src/lib/api-error";

// 目的: サーバーの英語メッセージを画面に出さず、code から表示文言を組み立てられること。
// これが崩れると i18n がサーバー実装に引きずられ、内部詳細もユーザーに漏れる。
describe("resolveApiError", () => {
  it("サーバーの message ではなく code から解決した文言を返す (内部詳細の非漏洩)", () => {
    const err = new ApiError(403, "INVALID_KEY", "Invalid access key");
    const msg = resolveApiError(err, "upload");
    expect(msg).not.toContain("Invalid access key");
    expect(msg).toContain("受信URL");
  });

  it("同じ code でも context により文言が変わる (NOT_FOUND の意味はフローごとに違う)", () => {
    const err = new ApiError(404, "NOT_FOUND", "Session not found");
    expect(resolveApiError(err, "upload")).not.toBe(resolveApiError(err, "deleteAccount"));
  });

  it("context に定義のない code は共通フォールバックに落ちる", () => {
    const err = new ApiError(507, "QUOTA_EXCEEDED", "Storage quota exceeded");
    // upload には QUOTA_EXCEEDED 専用の文言があり、register には無いので COMMON 側に落ちる。
    // 文言そのものを assert すると Phase 2 の t マクロ置換で割れるため、
    // 「context 固有の定義がある方とない方で結果が違う」ことだけを固定する
    expect(resolveApiError(err, "register")).not.toBe(resolveApiError(err, "upload"));
    expect(resolveApiError(err, "register")).toBeTruthy();
  });

  it("未知の code でも文言を返す (空文字や undefined を画面に出さない)", () => {
    const err = new ApiError(418, "SOMETHING_NEW", "teapot");
    expect(resolveApiError(err, "upload")).toBeTruthy();
    expect(resolveApiError(err, "upload")).not.toContain("teapot");
  });

  it("fetch 自体の失敗 (TypeError) はオフライン向けの案内になる", () => {
    expect(resolveApiError(new TypeError("Failed to fetch"), "upload")).toContain("ネットワーク");
  });
});

describe("resolveAuthError", () => {
  it("Firebase の code から文言を解決し、SDK の英語 message は出さない", () => {
    const err = Object.assign(new Error("Firebase: Error (auth/popup-closed-by-user)."), {
      code: "auth/popup-closed-by-user",
    });
    const msg = resolveAuthError(err);
    expect(msg).not.toContain("Firebase");
    expect(msg).toContain("キャンセル");
  });

  it("未知の Firebase エラーでもフォールバック文言を返す", () => {
    const err = Object.assign(new Error("boom"), { code: "auth/unknown-thing" });
    expect(resolveAuthError(err)).toBeTruthy();
    expect(resolveAuthError(err)).not.toContain("boom");
  });
});
