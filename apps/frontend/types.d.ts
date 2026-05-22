import type { RowData } from "@tanstack/table-core";
import type { useTranslations } from "use-intl";

import type { Locale, Messages } from "@/config/i18n";

declare module "use-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}

declare module "@tanstack/react-table" {
  interface TableMeta<TData extends RowData> {
    t: ReturnType<typeof useTranslations>;
    messages?: Messages;
    lang: Locale;
    loadingSortColumnId?: string;
    activeSort?: {
      id: string;
      desc: boolean;
    };
  }
}
