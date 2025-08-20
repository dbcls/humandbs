import { Alerts } from "@/components/Alerts";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import {
  $getHiddenAlertIds,
  getActiveAlertsQueryOptions,
} from "@/serverFunctions/alert";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_main")({
  component: RouteComponent,
  loader: async ({ context }) => {
    const locale = context.lang;
    const activeAlertTranslations = await context.queryClient.ensureQueryData(
      getActiveAlertsQueryOptions({ locale })
    );

    const hiddenAlerts = await $getHiddenAlertIds();

    return {
      alerts: activeAlertTranslations.filter(
        (alert) => !hiddenAlerts.includes(alert.alertId)
      ),
    };
  },
});

function RouteComponent() {
  return (
    <main className="flex flex-col gap-2 p-4">
      <Navbar />
      <Alerts />

      <Outlet />
      <Footer />
    </main>
  );
}
