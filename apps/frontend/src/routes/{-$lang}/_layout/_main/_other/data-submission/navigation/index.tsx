import { createFileRoute } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import { Card } from "@/components/Card";
import { NavigationChart } from "@/components/NavigationChart";
import { $getNavigationFlowchartData } from "@/serverFunctions/navigationFlowchart";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-submission/navigation/",
)({
  component: RouteComponent,
  loader: ({ context }) =>
    $getNavigationFlowchartData({ data: { type: "data-submission", locale: context.lang } }),
});

function RouteComponent() {
  const navigate = Route.useNavigate();

  const navData = Route.useLoaderData();

  const t = useTranslations("Data-submission");

  return (
    <Card caption={t("data-submission")} captionSize={"lg"}>
      <NavigationChart data={navData} navigate={(location) => { navigate(location); }} />
    </Card>
  );
}
