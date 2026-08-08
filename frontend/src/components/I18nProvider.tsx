import { msg } from "@lingui/core/macro";
import { I18nProvider as LinguiProvider } from "@lingui/react";
import { useAtomValue } from "jotai";
import { type ReactNode, useEffect, useState } from "react";
import { extractError, trackClientError } from "../lib/analytics";
import { activateLocale, i18n, type Locale, SOURCE_LOCALE } from "../lib/i18n";
import { localeAtom } from "../stores/locale";

/** index.html の title は静的なので、ロケールに追従させるにはここで上書きする */
const APP_TITLE = msg`FurDrop — 撮ってもらった写真を、ちゃんと受け取る。`;

/**
 * カタログのロードが済むまで描画しない。先に描画するとメッセージ ID (ハッシュ) が
 * 一瞬見えるため。
 */
export default function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useAtomValue(localeAtom);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    activateLocale(locale)
      .catch((err) => {
        // カタログのチャンクロードに失敗しても描画は続ける。ここで止めると
        // 画面が真っ白になり、言語が読めない以前にアプリが使えなくなる。
        // 未ロード時の Lingui は msgid (= 日本語の原文) にフォールバックする
        trackClientError({
          error_kind: "chunk_load",
          context: "i18n-catalog",
          ...extractError(err),
        });
        return null;
      })
      .then((activated) => {
        if (cancelled) return;
        // 失敗・古い要求だった場合は実際に有効なカタログの言語に合わせる。
        // lang 属性だけ切り替わって中身が別言語、という食い違いを防ぐ
        const effective = activated ?? (i18n.locale as Locale) ?? SOURCE_LOCALE;
        document.documentElement.lang = effective;
        document.title = i18n._(APP_TITLE);
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  if (!ready) return null;

  return <LinguiProvider i18n={i18n}>{children}</LinguiProvider>;
}
