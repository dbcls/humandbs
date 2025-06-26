import { z } from "zod";
import en from "../../localization/messages/en.json";

export type Messages = typeof en;

export const i18n = {
  defaultLocale: "ja",
  locales: ["en", "ja"],
} as const;

export type Locale = (typeof i18n)["locales"][number];

function unionOfLiterals<T extends string | number>(constants: readonly T[]) {
  const literals = constants.map((x) => z.literal(x)) as unknown as readonly [
    z.ZodLiteral<T>,
    z.ZodLiteral<T>,
    ...z.ZodLiteral<T>[],
  ];
  return z.union(literals);
}

export const localeSchema = unionOfLiterals(i18n.locales);

declare module "use-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
