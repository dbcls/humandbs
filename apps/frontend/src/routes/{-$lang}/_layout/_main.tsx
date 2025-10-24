import { Alerts } from "@/components/Alerts";
import {
  $getHiddenAlertIds,
  getActiveAlertsQueryOptions,
} from "@/serverFunctions/alert";

import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/{-$lang}/_layout/_main")({
  component: RouteComponent,

  loader: async ({ context }) => {
    const locale = context.lang;
    // const activeAlertTranslations = await context.queryClient.ensureQueryData(
    //   getActiveAlertsQueryOptions({ locale })
    // );

    // const hiddenAlerts = await $getHiddenAlertIds();

    return {
      // alerts: activeAlertTranslations.filter(
      //   (alert) => !hiddenAlerts.includes(alert.newsId)
      // ),
      alerts: []
    };
  },
});

function RouteComponent() {
  return (
    <main className="flex flex-col gap-2 p-4">
      <Alerts />

      <Outlet />
    </main>
  );
}
