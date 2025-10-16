import { i18n, Locale } from "@/lib/i18n-config";

export function resolveLang(params: { lang?: string | null }) {
  const candidate = params.lang;
  if (candidate && i18n.locales.includes(candidate as Locale)) {
    return { lang: candidate as Locale, wasLocalePrefix: true };
  }
  return { lang: i18n.defaultLocale, wasLocalePrefix: false };
}

export function normalizeSplat(params: { lang?: string; _splat?: string }) {
  const { wasLocalePrefix } = resolveLang(params);

  const segments = wasLocalePrefix
    ? [params._splat]
    : [params.lang, params._splat];

  return segments
    .filter((segment): segment is string => !!segment && segment.length > 0)
    .join("/");
}
