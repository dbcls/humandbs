import { i18n, type Locale } from "@/config/i18n";

type LocalizedEntry = string | { text: string; rawHtml?: string } | null;
type MultilingualValue = Record<Locale, LocalizedEntry>;
type PossiblyMultilingualValue =
  | string
  | string[]
  | MultilingualValue
  | null
  | undefined;

export function extractStringFromPossiblyMultilingualValue(
  value: PossiblyMultilingualValue,
  lang: Locale = i18n.defaultLocale,
): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join(", ");
  const entry = value[lang];
  if (entry === null || entry === undefined) return "";
  if (typeof entry === "string") return entry;
  return entry.text;
}
