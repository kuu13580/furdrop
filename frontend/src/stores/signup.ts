import { atomWithStorage, createJSONStorage } from "jotai/utils";

/**
 * 登録フォームのハンドル初期値ヒント。
 * ログイン時にTwitter screenNameなどから自動生成して保存する。
 * リロードでも残るよう sessionStorage に永続化 (タブ閉じで消える)。
 */
export const suggestedHandleAtom = atomWithStorage<string | null>(
  "furdrop.suggestedHandle",
  null,
  createJSONStorage(() => sessionStorage),
);

/** FurDropのハンドル形式 (^[a-z0-9_]{3,32}$) に寄せてサニタイズ */
export function sanitizeHandle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 32);
}
