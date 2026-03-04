import { enumFromStringArray } from "@/utils/zod";

import en from "../../localization/messages/en.json";

export type Messages = typeof en;

export const i18n = {
  defaultLocale: "ja",
  locales: ["en", "ja"],
} as const;

export type Locale = (typeof i18n)["locales"][number];

export const localeSchema = enumFromStringArray(i18n.locales);
