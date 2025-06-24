import { cn } from "@/lib/utils";
import { i18n, Locale } from "@/serverFunctions/i18n-config";
import {
  useNavigate,
  useRouteContext,
  useRouter,
} from "@tanstack/react-router";

import { useState } from "react";

export function LangSwitcher() {
  const { navigate, invalidate } = useRouter();

  const { lang: currentLang } = useRouteContext({ from: "/$lang" });

  const [count, setCount] = useState(0);

  function handleSwitch(lang: Locale) {
    navigate({ to: ".", params: { lang } });
    invalidate();
  }

  return (
    <div className="bg-primary/50 f relative flex rounded-full p-1">
      {i18n.locales.map((lang) => (
        <button
          onClick={() => {
            handleSwitch(lang);
          }}
          key={lang}
          className={cn(
            "text-foreground-light z-10 h-8 w-8 cursor-pointer rounded-full text-center text-sm font-bold uppercase",
            {
              "text-white": currentLang === lang,
            }
          )}
        >
          {lang}
        </button>
      ))}
      {count}
      <button onClick={() => setCount((p) => p + 1)}> + </button>

      <div
        className="bg-secondary absolute z-0 size-8 rounded-full transition-transform"
        style={{
          transform: `translateX(${currentLang === "en" ? 0 : 32}px)`,
        }}
      />
    </div>
  );
}
