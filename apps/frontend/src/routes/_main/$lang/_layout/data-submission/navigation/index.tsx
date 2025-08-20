import { Card } from "@/components/Card";
import { NavigationChart, NavigationData } from "@/components/NavigationChart";
import { useTranslations } from "use-intl";
import { createFileRoute } from "@tanstack/react-router";
import { $getNavigationFlowchartData } from "@/serverFunctions/navigationFlowchart";

export const Route = createFileRoute(
  "/_main/$lang/_layout/data-submission/navigation/"
)({
  component: RouteComponent,
  loader: () =>
    $getNavigationFlowchartData({ data: { type: "data-submission" } }),
});

function RouteComponent() {
  const navigate = Route.useNavigate();

  const navData = Route.useLoaderData();

  const t = useTranslations("Data-submission");

  return (
    <Card caption={t("data-submission")} captionSize={"lg"}>
      <NavigationChart data={navData} navigate={navigate} />
    </Card>
  );
}
