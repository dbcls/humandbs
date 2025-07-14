import { Card } from "@/components/Card";
import { NavigationChart } from "@/components/NavigationChart";
import { useTranslations } from "use-intl";
import { createFileRoute } from "@tanstack/react-router";

import navigationDataJa from "@/db/navigation/navigationdataja.nav.json";
import navigationDataEn from "@/db/navigation/navigationdataen.nav.json";

export const Route = createFileRoute(
  "/_main/$lang/_layout/data-submission/navigation/"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = Route.useNavigate();
  const { lang } = Route.useParams();
  const t = useTranslations("Data-submission");

  const navigationData = lang === "ja" ? navigationDataJa : navigationDataEn;

  return (
    <Card caption={t("data-submission")} captionSize={"lg"}>
      <NavigationChart data={navigationData} navigate={navigate} />
    </Card>
  );
}
