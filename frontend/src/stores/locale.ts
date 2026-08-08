import { atom } from "jotai";
import { LOCALE_QUERY_PARAM, type Locale, persistLocale, resolveInitialLocale } from "../lib/i18n";

export const localeAtom = atom<Locale>(resolveInitialLocale(window.location.search));

/** 切替は明示操作なので永続化して次回訪問でも維持する */
export const setLocaleAtom = atom(null, (_get, set, next: Locale) => {
  set(localeAtom, next);
  persistLocale(next);
  // `?lang=` は localStorage より優先されるので、残したままだとリロードで
  // 切替前に巻き戻る。明示的に選んだ時点で URL 側の指定は役目を終える
  const url = new URL(window.location.href);
  if (url.searchParams.has(LOCALE_QUERY_PARAM)) {
    url.searchParams.delete(LOCALE_QUERY_PARAM);
    window.history.replaceState(null, "", url);
  }
});
