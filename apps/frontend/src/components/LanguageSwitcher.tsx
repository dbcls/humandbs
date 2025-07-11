import { cn } from "@/lib/utils";
import { i18n as i18nConfig, Locale } from "@/lib/i18n-config";
import { saveLocaleFn } from "@/serverFunctions/locale";
import { useRouter } from "@tanstack/react-router";
import { useLocale } from "use-intl";

export function LangSwitcher() {
  const { navigate } = useRouter();
  const currentLang = useLocale();

  async function handleSwitch(lang: Locale) {
    await saveLocaleFn({ data: { lang } });

    await navigate({ to: ".", params: { lang } });
  }

  return (
    <div className="bg-primary/50 relative flex rounded-full p-2">
      {i18nConfig.locales.map((lang) => (
        <button
          onClick={() => {
            handleSwitch(lang);
          }}
          key={lang}
          className={cn(
            "text-foreground-light z-10 h-12 w-12 cursor-pointer rounded-full text-center text-sm font-bold uppercase",
            {
              "text-white": currentLang === lang,
            }
          )}
        >
          {lang}
        </button>
      ))}

      <div
        className="bg-secondary absolute z-0 size-12 rounded-full transition-transform"
        style={{
          transform: `translateX(${currentLang === "en" ? 0 : "3rem"})`,
        }}
      />
    </div>
  );
}
