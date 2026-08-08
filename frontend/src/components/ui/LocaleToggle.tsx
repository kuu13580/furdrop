import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useId } from "react";
import type { Locale } from "../../lib/i18n";
import { localeAtom, setLocaleAtom } from "../../stores/locale";

/**
 * 表示ラベルは endonym 固定で翻訳対象にしない。読めない言語で書かれた選択肢は
 * 探せないため。読み上げ用の aria はロケールに追従させる。
 */
const OPTIONS: { value: Locale; label: string; aria: MessageDescriptor }[] = [
  { value: "ja", label: "日本語", aria: msg`日本語に切り替える` },
  { value: "en", label: "EN", aria: msg`英語に切り替える` },
];

const GROUP_LABEL = msg`言語`;

export default function LocaleToggle({ className = "" }: { className?: string }) {
  const locale = useAtomValue(localeAtom);
  const setLocale = useSetAtom(setLocaleAtom);
  const { i18n } = useLingui();
  // ヘッダーは PC 用とモバイル用で 2 つ描画される。name を共有すると
  // ブラウザ側で 1 つの radio group として扱われてしまう
  const groupName = useId();

  return (
    <div
      role="radiogroup"
      aria-label={i18n._(GROUP_LABEL)}
      className={`flex shrink-0 items-center gap-0.5 rounded-full bg-surface-sand p-0.5 ${className}`}
    >
      {OPTIONS.map((opt) => {
        const checked = locale === opt.value;
        return (
          <label
            key={opt.value}
            aria-label={i18n._(opt.aria)}
            className={`cursor-pointer rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${
              checked ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink-soft"
            }`}
          >
            <input
              type="radio"
              name={groupName}
              value={opt.value}
              checked={checked}
              onChange={() => setLocale(opt.value)}
              className="sr-only"
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}
