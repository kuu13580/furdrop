import { atomWithStorage, createJSONStorage } from "jotai/utils";

// 既定の getStringStorage を使う (localStorage へのアクセス自体が SecurityError を投げる
// 環境があり、jotai 側の try/catch はそこにしか無い)
const baseStorage = createJSONStorage<string[]>();

function sanitize(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string");
}

/**
 * 閉じた期間限定お知らせの ID。**端末ごと**に持つ。
 * アカウント単位で厳密に1回にするには DB が要るが、お知らせのために
 * マイグレーションを増やすほどの精度は要らない。
 */
export const dismissedNoticesAtom = atomWithStorage<string[]>(
  "furdrop.dismissedNotices",
  [],
  {
    ...baseStorage,
    getItem: (key, initialValue) => sanitize(baseStorage.getItem(key, initialValue)),
  },
  { getOnInit: true },
);
