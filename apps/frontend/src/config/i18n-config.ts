import en from "../../localization/messages/en.json";
import { enumFromStringArray } from "../lib/utils";

export type Messages = typeof en;

export const i18n = {
  defaultLocale: "ja",
  locales: ["en", "ja"],
} as const;

export type Locale = (typeof i18n)["locales"][number];

export const localeSchema = enumFromStringArray(i18n.locales);

declare module "use-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
