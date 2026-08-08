import { msg } from "@lingui/core/macro";
import { I18nProvider as LinguiProvider } from "@lingui/react";
import { useAtomValue } from "jotai";
import { type ReactNode, useEffect, useState } from "react";
import { activateLocale, i18n } from "../lib/i18n";
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
    activateLocale(locale).then(() => {
      if (cancelled) return;
      document.documentElement.lang = locale;
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
