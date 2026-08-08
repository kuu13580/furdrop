import { i18n } from "@lingui/core";

export const LOCALES = ["ja", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** 原文のロケール。カタログ未ロード時はこの言語の msgid が出る */
export const SOURCE_LOCALE: Locale = "ja";

/** ja / en 以外のブラウザには日本語より英語のほうが読める可能性が高い */
export const FALLBACK_LOCALE: Locale = "en";

const STORAGE_KEY = "furdrop.locale";
export const LOCALE_QUERY_PARAM = "lang";

function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

function detectFromNavigator(): Locale | null {
  const languages = typeof navigator === "undefined" ? [] : (navigator.languages ?? []);
  for (const tag of languages) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return null;
}

/** `?lang=` → localStorage → ブラウザ言語 → en */
export function resolveInitialLocale(search: string): Locale {
  const fromQuery = new URLSearchParams(search).get(LOCALE_QUERY_PARAM);
  if (isLocale(fromQuery)) return fromQuery;
  return readStoredLocale() ?? detectFromNavigator() ?? FALLBACK_LOCALE;
}

export function readStoredLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function persistLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // localStorage が使えなくても表示自体は成立する
  }
}

/**
 * 直近に要求されたロケール。連続で切り替えたとき、先に投げた要求が後から
 * 完了して現在のカタログを上書きするのを防ぐ。
 */
let pendingLocale: Locale | null = null;

/** 有効化できたロケールを返す。要求が古くなっていた場合は null */
export async function activateLocale(locale: Locale): Promise<Locale | null> {
  pendingLocale = locale;
  const { messages } = await import(`../locales/${locale}/messages.po`);
  if (pendingLocale !== locale) return null;
  i18n.loadAndActivate({ locale, messages });
  return locale;
}

export { i18n };
