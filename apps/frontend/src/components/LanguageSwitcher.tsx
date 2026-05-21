import { useRouter } from "@tanstack/react-router";
import { useLocale } from "use-intl";

import type { Locale } from "@/config/i18n";
import { i18n, i18n as i18nConfig } from "@/config/i18n";
import { cn } from "@/lib/utils";

export function LangSwitcherPill({
  value,
  onChange,
}: {
  value: Locale;
  onChange: (lang: Locale) => void;
}) {
  return (
    <div className="relative flex rounded-full bg-primary/50 p-2">
      {i18nConfig.locales.map((lang) => (
        <button
          type="button"
          onClick={() => onChange(lang)}
          key={lang}
          className={cn(
            "z-10 h-10 w-10 cursor-pointer rounded-full text-center font-bold text-[10px] text-foreground-light uppercase",
            { "text-white": value === lang },
          )}
        >
          {lang}
        </button>
      ))}
      <div
        className="absolute z-0 size-10 rounded-full bg-secondary transition-transform"
        style={{
          transform: `translateX(${i18nConfig.locales.indexOf(value) * 2.5}rem)`,
        }}
      />
    </div>
  );
}

export function LangSwitcher() {
  const router = useRouter();
  const currentLang = useLocale() as Locale;

  async function handleSwitch(lang: Locale) {
    await router.invalidate({
      filter: (r) => r.fullPath !== "/{-$lang}/admin",
    });

    await router.navigate({
      to: ".",
      params: { lang: lang === i18n.defaultLocale ? undefined : lang },
      search: (prev) => prev,
    });
  }

  return <LangSwitcherPill value={currentLang} onChange={handleSwitch} />;
}
