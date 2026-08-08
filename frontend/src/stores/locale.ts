import { atom } from "jotai";
import { type Locale, persistLocale, resolveInitialLocale } from "../lib/i18n";

export const localeAtom = atom<Locale>(resolveInitialLocale(window.location.search));

/** 切替は明示操作なので永続化して次回訪問でも維持する */
export const setLocaleAtom = atom(null, (_get, set, next: Locale) => {
  set(localeAtom, next);
  persistLocale(next);
});
