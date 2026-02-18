import type { Locale, Messages } from "@/config/i18n";

declare module "use-intl" {
  interface IntlConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
