import type { Locale } from "use-intl";

import { i18n } from "@/config/i18n";

export function sortTranslationsByLocale<T extends { lang: Locale }>(translations: T[]): T[] {
  return [...translations].sort((a, b) => {
    if (a.lang === i18n.defaultLocale) return -1;
    if (b.lang === i18n.defaultLocale) return 1;

    return a.lang.localeCompare(b.lang);
  });
}
