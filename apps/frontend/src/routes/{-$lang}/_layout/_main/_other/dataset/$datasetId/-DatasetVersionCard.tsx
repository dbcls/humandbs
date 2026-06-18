import { useRouteContext } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";
import { useShallow } from "zustand/react/shallow";

import { AccessCriteriaLabel } from "@/components/AccessCriteriaLabel";
import { CardWithCaption } from "@/components/Card";
import { CardCaption } from "@/components/CardCaption";
import { ContentHeader } from "@/components/ContentHeader";
import { KeyValueCard } from "@/components/KeyValueCard";
import { Link } from "@/components/Link";
import { ResearchLink } from "@/components/ResearchLink";
import { Separator } from "@/components/Separator";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/config/i18n";
import { i18n } from "@/config/i18n";
import { isCartableDatasetId, useCartStore } from "@/hooks/useCart";
import type { DatasetDoc } from "@/lib/types";

export function DatasetVersionCard({
  versionData,
  lang: langOverride,
  showPublicActions = true,
}: {
  versionData: DatasetDoc;
  lang?: Locale;
  showPublicActions?: boolean;
}) {
  const { lang: routeLang } = useRouteContext({ from: "/{-$lang}/_layout" });
  const { user } = useRouteContext({ from: "__root__" });
  const lang = langOverride ?? routeLang ?? i18n.defaultLocale;
  const t = useTranslations("Dataset");

  const infoKeyValues = [
    { title: t("releaseDate"), value: versionData.releaseDate },
    { title: t("date-modified"), value: versionData.versionReleaseDate },
    {
      title: t("research"),
      value: <ResearchLink humId={versionData.humId} />,
    },
    { title: t("typeOfData"), value: versionData.typeOfData?.[lang] ?? "—" },
    {
      title: t("criteria"),
      value: <AccessCriteriaLabel size={"md"} criteria={versionData.criteria} />,
    },
  ];

  const { add, isInCart, remove } = useCartStore(
    useShallow((state) => ({
      add: state.add,
      remove: state.remove,
      isInCart: state.cartDatasets.includes(versionData.datasetId),
    })),
  );

  const handleToggleDataset = () => {
    if (isInCart) {
      remove([versionData.datasetId]);
    } else {
      add([versionData.datasetId]);
    }
  };

  const identifier =
    [versionData.datasetId, versionData.version].filter(Boolean).join(".") || "Preview";

  const showAddToCartButton = isCartableDatasetId(versionData.datasetId);

  return (
    <CardWithCaption
      size={"lg"}
      variant={"light"}
      caption={
        <div>
          <CardCaption
            className="flex-1"
            title="NBDC Dataset ID:"
            icon="dataset"
            badge={
              showPublicActions ? (
                <Link
                  to="/{-$lang}/dataset/$datasetId/versions"
                  params={{ datasetId: versionData.datasetId }}
                  className="text-white no-underline"
                >
                  {t("release-info")}
                </Link>
              ) : null
            }
            right={
              showPublicActions && showAddToCartButton ? (
                <div className="flex gap-5">
                  <Button variant={"accent"} className="rounded-full" onClick={handleToggleDataset}>
                    {user ? (
                      isInCart ? (
                        <>
                          <X className="size-5" /> {t("remove-from-cart")}
                        </>
                      ) : (
                        t("add-to-cart")
                      )
                    ) : (
                      t("login-to-add")
                    )}
                  </Button>
                </div>
              ) : null
            }
          >
            {identifier}
          </CardCaption>
        </div>
      }
    >
      <section>
        <dl className="mb-7 columns-2">
          {infoKeyValues.map((info) => (
            <div key={info.title} className="break-inside-avoid-column">
              <KeyValueCard title={info.title} value={info.value} />
              <Separator show variant={"solid"} />
            </div>
          ))}
        </dl>
        <ContentHeader>{t("experiments")}</ContentHeader>

        {versionData.experiments.map((e) => (
          <Experiment key={`${e.header.en?.text}-${e.header.ja?.text}`} experiment={e} />
        ))}
      </section>
    </CardWithCaption>
  );
}

function Experiment({ experiment }: { experiment: DatasetDoc["experiments"][number] }) {
  const t = useTranslations("Dataset");
  const lang = useLocale();
  return (
    <section className="mt-3 first:mt-0">
      <h2 className="rounded-t-md bg-linear-to-r from-secondary-light to-secondary-lighter px-7 pt-5 pb-4 text-white">
        {experiment.header[lang]?.text}
      </h2>

      <dl className="columns-2 space-y-6 border-gray-300 border-x border-b p-6">
        {Object.entries(experiment.data).map(([title, content]) => (
          <KeyValueCard
            key={title}
            // @ts-expect-error
            title={t(title)}
            value={content?.[lang]?.rawHtml}
          />
        ))}
      </dl>
    </section>
  );
}
