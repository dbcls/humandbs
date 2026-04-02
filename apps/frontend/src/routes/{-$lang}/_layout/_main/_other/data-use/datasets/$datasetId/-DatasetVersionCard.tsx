import { type DatasetDoc } from "@humandbs/backend/types";
import { Link, useRouteContext } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import { CardWithCaption } from "@/components/Card";
import { CardCaption } from "@/components/CardCaption";
import { ContentHeader } from "@/components/ContentHeader";
import { ListOfKeyValues } from "@/components/KeyValueCard";
import { Button } from "@/components/ui/button";
import { i18n } from "@/config/i18n";
import { useCart } from "@/hooks/useCart";

export function DatasetVersionCard({
  versionData,
  lang: langOverride,
  showPublicActions = true,
}: {
  versionData: Pick<
    DatasetDoc,
    "criteria" | "datasetId" | "releaseDate" | "typeOfData" | "version"
  >;
  lang?: "ja" | "en";
  showPublicActions?: boolean;
}) {
  const { lang: routeLang } = useRouteContext({ from: "/{-$lang}/_layout" });
  const { user } = useRouteContext({ from: "__root__" });
  const lang = langOverride ?? routeLang ?? i18n.defaultLocale;
  const t = useTranslations("DatasetVersionCard");

  const infoKeyValues = {
    [t("releaseDate")]: versionData.releaseDate,
    [t("typeOfData")]: versionData.typeOfData?.[lang] ?? "—",
    [t("criteria")]: versionData.criteria,
  };

  const { add, cart } = useCart();

  const isInCart = cart.some(
    (item) => item.datasetId === versionData.datasetId,
  );

  const identifier =
    [versionData.datasetId, versionData.version].filter(Boolean).join(".") ||
    "Preview";

  return (
    <CardWithCaption
      size={"lg"}
      variant={"light"}
      caption={
        <CardCaption
          title="NBDC Dataset ID:"
          icon="dataset"
          badge={
            showPublicActions ? (
              <Link
                to="/{-$lang}/data-use/datasets/$datasetId/versions"
                params={{ datasetId: versionData.datasetId }}
              >
                {t("releaseInfo")}
              </Link>
            ) : null
          }
          right={
            showPublicActions && user ? (
              <div className="flex gap-5">
                <Button
                  variant={"accent"}
                  className="rounded-full"
                  disabled={isInCart}
                  onClick={() => {
                    add(versionData as DatasetDoc);
                  }}
                >
                  {isInCart ? t("alreadyInCart") : t("addToCart")}
                </Button>
              </div>
            ) : null
          }
        >
          {identifier}
        </CardCaption>
      }
    >
      <section>
        <ContentHeader>{t("info")}</ContentHeader>
        <ListOfKeyValues keyValues={infoKeyValues} />
      </section>
    </CardWithCaption>
  );
}
