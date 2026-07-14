import { useRouteContext } from "@tanstack/react-router";
import { Download, File, FolderOpen, X } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";
import { useShallow } from "zustand/react/shallow";

import { useState } from "react";

import type { DatasetDocWithMerged } from "@humandbs/backend/types";

import { AccessCriteriaLabel } from "@/components/AccessCriteriaLabel";
import { CardWithCaption } from "@/components/Card";
import { CardCaption } from "@/components/CardCaption";
import { ContentHeader } from "@/components/ContentHeader";
import { FilterSearchInput } from "@/components/FilterSearchInput";
import { KeyValueCard } from "@/components/KeyValueCard";
import { Markdown } from "@/components/markdown";
import { ResearchLink } from "@/components/ResearchLink";
import { Separator } from "@/components/Separator";
import { TextWithIcon } from "@/components/TextWithIcon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Locale } from "@/config/i18n";
import { i18n } from "@/config/i18n";
import type { messages } from "@/config/messages";
import { compareMoldataKeys } from "@/config/moldataKeyOrder";
import { isCartableDatasetId, useCartStore } from "@/hooks/useCart";
import type { DatasetDoc } from "@/lib/types";
import type { RenderedExperiment } from "@/utils/renderedHtml/types";

type Distribution = NonNullable<DatasetDocWithMerged["distribution"]>;

/** Dataset card data: experiments carry the frontend `renderedHtml` projection. */
type DatasetCardData = Omit<DatasetDoc, "experiments"> & {
  experiments: RenderedExperiment[];
  distribution?: Distribution;
};

type MoldataKey = keyof (typeof messages)["en"]["Dataset"]["moldata-keys"];
type MoldataTranslationKey = `moldata-keys.${MoldataKey}`;

export function DatasetVersionCard({
  versionData,
  lang: langOverride,
  showPublicActions = true,
}: {
  versionData: DatasetCardData;
  lang?: Locale;
  showPublicActions?: boolean;
}) {
  const { lang: routeLang } = useRouteContext({ from: "/{-$lang}/_layout" });

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

  const showAddToCartButton = isCartableDatasetId(versionData.datasetId);

  return (
    <CardWithCaption
      size={"lg"}
      variant={"light"}
      caption={
        <CardCaption
          className="flex-1"
          icon="dataset"
          right={
            <div className="flex gap-5">
              {versionData.distribution && versionData.distribution.length > 0 && (
                <DistributionDialog distribution={versionData.distribution} />
              )}
              {showPublicActions && showAddToCartButton && (
                <Button variant={"accent"} className="rounded-full" onClick={handleToggleDataset}>
                  {isInCart ? (
                    <>
                      <X className="size-5" /> {t("remove-from-cart")}
                    </>
                  ) : (
                    t("add-to-cart")
                  )}
                </Button>
              )}
            </div>
          }
        >
          {versionData.datasetId}
        </CardCaption>
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

function DistributionDialog({ distribution }: { distribution: Distribution }) {
  const t = useTranslations("Dataset");
  const [filter, setFilter] = useState<string>();

  const sorted = distribution
    .slice()
    .sort((a, b) => (a.type === b.type ? 0 : a.type === "directory" ? -1 : 1));

  const q = filter?.trim().toLowerCase();
  const filtered = q ? sorted.filter((item) => item.name.toLowerCase().includes(q)) : sorted;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={"tableAction"} className="border border-white">
          <Download className="mr-2 size-5" /> {t("distribution-button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("distribution")}</DialogTitle>
        </DialogHeader>
        <FilterSearchInput
          value={filter}
          onChange={setFilter}
          debounceMs={0}
          placeholder={t("distribution-filter-placeholder")}
        />
        <div className="h-[60vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-2 text-muted-foreground text-sm">{t("distribution-no-matches")}</p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((item) => (
                <li key={item.url}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-md px-2 py-1.5 no-underline hover:bg-hover"
                  >
                    <TextWithIcon
                      icon={
                        item.type === "directory" ? (
                          <FolderOpen className="size-5 shrink-0 self-center text-secondary" />
                        ) : (
                          <File className="size-5 shrink-0 self-center text-secondary" />
                        )
                      }
                    >
                      <span className="ml-1 break-all text-secondary underline">{item.name}</span>
                    </TextWithIcon>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Experiment({ experiment }: { experiment: RenderedExperiment }) {
  const t = useTranslations("Dataset");
  const lang = useLocale();
  return (
    <section className="mt-3 first:mt-0">
      <h2 className="rounded-t-md bg-linear-to-r from-secondary-light to-secondary-lighter px-7 pt-5 pb-4 text-white">
        {experiment.header[lang]?.text}
      </h2>

      <dl className="columns-2 space-y-6 border-gray-300 border-x border-b p-6">
        {Object.entries(experiment.data)
          .sort(([left], [right]) => compareMoldataKeys(left, right))
          .map(([title, content]) => {
            const markup = content?.[lang]?.renderedHtml;
            const moldataTranslationKey = `moldata-keys.${title}` as MoldataTranslationKey;
            return (
              <KeyValueCard
                key={title}
                title={t.has(moldataTranslationKey) ? t(moldataTranslationKey) : title}
                value={
                  markup ? (
                    <Markdown className="inline-prose text-base" contentHtml={{ markup }} />
                  ) : undefined
                }
              />
            );
          })}
      </dl>
    </section>
  );
}
