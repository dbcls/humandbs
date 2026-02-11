import { createFileRoute } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import { Card } from "@/components/Card";
import { NavigationChart } from "@/components/NavigationChart";
import { $getNavigationFlowchartData } from "@/serverFunctions/navigationFlowchart";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-submission/navigation/before-application/"
)({
  component: RouteComponent,
  loader: () =>
    $getNavigationFlowchartData({
      data: { type: "before-application" },
    }),
});

function RouteComponent() {
  const navData = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const t = useTranslations("Data-submission");

  return (
    <Card caption={t("before-application")} captionSize={"lg"}>
      <NavigationChart data={navData} navigate={navigate} />
    </Card>
  );
}
