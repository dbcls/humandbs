import type { Locale, Messages } from "@/config/i18n";
import type { RowData } from "@tanstack/table-core";

declare module "use-intl" {
  interface IntlConfig {
    Locale: Locale;
    Messages: Messages;
  }
}

declare module "@tanstack/react-table" {
  interface TableMeta<TData extends RowData> {
    t: (key: string) => string;
    lang: Locale;
  }
}
