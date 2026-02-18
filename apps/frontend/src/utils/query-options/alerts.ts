import { queryOptions } from "@tanstack/react-query";

import type { Locale } from "@/config/i18n";
import { $getActiveAlerts } from "@/serverFunctions/alert";

export function getActiveAlertsQueryOptions({ locale }: { locale: Locale }) {
  return queryOptions({
    queryKey: ["activeAlerts", locale],
    queryFn: () => $getActiveAlerts({ data: { locale } }),
    enabled: !!locale,
    staleTime: 1000 * 60 * 60 * 24,
  });
}
