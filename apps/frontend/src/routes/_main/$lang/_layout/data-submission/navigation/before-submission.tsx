import { Card } from "@/components/Card";
import { NavigationChart } from "@/components/NavigationChart";
import { useTranslations } from "use-intl";
import { createFileRoute } from "@tanstack/react-router";

import navigationDataSubJa from "@/db/navigation/navigationdatasubja.nav.json";
import navigationDataSubEn from "@/db/navigation/navigationdatasuben.nav.json";

export const Route = createFileRoute(
  "/_main/$lang/_layout/data-submission/navigation/before-submission"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = Route.useNavigate();
  const { lang } = Route.useParams();
  const t = useTranslations("Data-submission");

  const navigationData =
    lang === "ja" ? navigationDataSubJa : navigationDataSubEn;
  return (
    <Card caption={t("before-submission")} captionSize={"lg"}>
      <NavigationChart data={navigationData} navigate={navigate} />
    </Card>
  );
}
