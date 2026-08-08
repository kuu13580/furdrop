import { useAtomValue, useSetAtom } from "jotai";
import type { Locale } from "../../lib/i18n";
import { localeAtom, setLocaleAtom } from "../../stores/locale";

/**
 * 言語名は endonym 固定で翻訳対象にしない。読めない言語で書かれた選択肢は
 * 探せないため。
 */
const OPTIONS: { value: Locale; label: string; aria: string }[] = [
  { value: "ja", label: "日本語", aria: "日本語に切り替える" },
  { value: "en", label: "EN", aria: "Switch to English" },
];

export default function LocaleToggle({ className = "" }: { className?: string }) {
  const locale = useAtomValue(localeAtom);
  const setLocale = useSetAtom(setLocaleAtom);

  return (
    <div
      role="radiogroup"
      aria-label="Language / 言語"
      className={`flex shrink-0 items-center gap-0.5 rounded-full bg-surface-sand p-0.5 ${className}`}
    >
      {OPTIONS.map((opt) => {
        const checked = locale === opt.value;
        return (
          <label
            key={opt.value}
            aria-label={opt.aria}
            className={`cursor-pointer rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${
              checked ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink-soft"
            }`}
          >
            <input
              type="radio"
              name="locale"
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
