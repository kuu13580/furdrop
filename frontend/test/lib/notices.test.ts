import { describe, expect, it } from "vitest";
import { EMAIL_NOTICE_ID, shouldShowEmailNotice } from "../../src/lib/notices";

// 目的: お知らせが「出るべき人にだけ、期限まで」出ること。
// 誤って出し続けると壁紙になり、誤って出ないと機能が知られないまま終わる。
const NOW = Date.UTC(2026, 8, 25);

const base = {
  notificationEmail: null,
  pendingEmail: null,
  dismissed: [] as string[],
  now: NOW,
};

describe("shouldShowEmailNotice", () => {
  it("通知が未設定なら出す (写真をまだ受け取っていない人にも)", () => {
    expect(shouldShowEmailNotice(base)).toBe(true);
  });

  it("通知先を登録済み・検証待ちのどちらでも出さない", () => {
    expect(shouldShowEmailNotice({ ...base, notificationEmail: "me@example.com" })).toBe(false);
    expect(shouldShowEmailNotice({ ...base, pendingEmail: "me@example.com" })).toBe(false);
  });

  it("閉じたら出さない (他のお知らせ ID は影響しない)", () => {
    expect(shouldShowEmailNotice({ ...base, dismissed: [EMAIL_NOTICE_ID] })).toBe(false);
    expect(shouldShowEmailNotice({ ...base, dismissed: ["something-else"] })).toBe(true);
  });

  it("期限を過ぎたら出さない", () => {
    // JST の 3/22 いっぱいまで = UTC 3/22 15:00
    expect(shouldShowEmailNotice({ ...base, now: Date.UTC(2027, 2, 22, 14) })).toBe(true);
    expect(shouldShowEmailNotice({ ...base, now: Date.UTC(2027, 2, 22, 15) })).toBe(false);
    expect(shouldShowEmailNotice({ ...base, now: Date.UTC(2027, 3, 1) })).toBe(false);
  });
});
