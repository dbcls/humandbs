import { messages } from "./messages";

export type MoldataKeyLabel = {
  en: string;
  ja: string;
};

export function getMoldataKeyLabel(key: string): MoldataKeyLabel | null {
  const en = messages.en.Dataset["moldata-keys"] as Record<string, string>;
  const ja = messages.ja.Dataset["moldata-keys"] as Record<string, string>;

  if (!en[key] || !ja[key]) return null;

  return { en: en[key], ja: ja[key] };
}
