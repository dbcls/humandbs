import { match as matchLocale } from "@formatjs/intl-localematcher";
import { createServerFn } from "@tanstack/react-start";
import {
  getCookie,
  getWebRequest,
  setCookie,
} from "@tanstack/react-start/server";
import Negotiator from "negotiator";
import { z } from "zod";
import { i18n as i18nConfig, Locale, localeSchema } from "../lib/i18n-config";

const localeKey = "locale";

export const getMessagesFn = createServerFn({ response: "data" })
  .validator(localeSchema)
  .handler(async ({ data }) => {
    const locale = data as Locale;
    const content = (await import(`../../localization/messages/${locale}.json`))
      .default;
    return content;
  });

/**
 * Get locale.
 * 0. - check if locale is already in pathname
 * 1. - Try to get locale from cookie
 * 2. - Try to get locale from request header
 * 3. - if no success, fallback to default locale
 */
function getLocale(request: Request): Locale {
  const pathnameLocale = new URL(request.url).pathname.split("/")[1];

  if (i18nConfig.locales.some((loc) => loc === pathnameLocale)) {
    return pathnameLocale as Locale;
  }

  let locale = getCookie(localeKey) as Locale | null | undefined;

  if (!locale) {
    // Negotiator expects plain object so we need to transform headers
    const negotiatorHeaders: Record<string, string> = {};

    request.headers.forEach((value, key) => (negotiatorHeaders[key] = value));

    // @ts-expect-error locales are readonly
    const locales: string[] = i18nConfig.locales;

    // Use negotiator and intl-localematcher to get best locale
    const languages = new Negotiator({ headers: negotiatorHeaders }).languages(
      locales
    );

    locale = matchLocale(
      languages,
      locales,
      i18nConfig.defaultLocale
    ) as Locale;
  }

  return locale;
}

export const getLocaleFn = createServerFn().handler(async () => {
  const request = getWebRequest();

  return getLocale(request);
});

export const saveLocaleFn = createServerFn({ method: "POST" })
  .validator(z.object({ lang: z.string().min(2).max(2) }))
  .handler((ctx) => {
    setCookie(localeKey, ctx.data.lang, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  });
