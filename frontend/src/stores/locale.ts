import { atom } from "jotai";
import { type Locale, persistLocale, resolveInitialLocale } from "../lib/i18n";

export const localeAtom = atom<Locale>(resolveInitialLocale(window.location.search));

/**
 * ロケールを切り替えて永続化する。
 *
 * URL からの `?lang=` の除去は App の LocaleUrlSync が Router 経由で行う。
 * ここで history を直接触ると React Router の searchParams と食い違い、
 * 以降の setSearchParams で消したはずの `?lang=` が復活しうる。
 */
export const setLocaleAtom = atom(null, (_get, set, next: Locale) => {
  set(localeAtom, next);
  persistLocale(next);
});
