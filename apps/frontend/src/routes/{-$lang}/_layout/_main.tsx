import { createFileRoute, Outlet } from "@tanstack/react-router";

import { Alerts } from "@/components/Alerts";
import { Footer } from "@/components/Footer";
import { getActiveAlertsQueryOptions } from "@/utils/query-options/alerts";

export const Route = createFileRoute("/{-$lang}/_layout/_main")({
  component: RouteComponent,

  loader: async ({ context }) => {
    const locale = context.lang;
    const alerts = await context.queryClient.ensureQueryData(
      getActiveAlertsQueryOptions({ locale }),
    );

    return { alerts };
  },
});

function RouteComponent() {
  return (
    <>
      <main className="z-10 flex flex-1 flex-col items-stretch gap-4 p-4">
        <Alerts />
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
