import { type DatasetDoc } from "@humandbs/backend/types";
import {
  useLocation,
  useNavigate,
  useRouteContext,
} from "@tanstack/react-router";
import { useLocale, useTranslations } from "use-intl";

import { CardWithCaption } from "@/components/Card";
import { CardCaption } from "@/components/CardCaption";
import { ContentHeader } from "@/components/ContentHeader";
import { KeyValueCard } from "@/components/KeyValueCard";
import { Button } from "@/components/ui/button";
import { i18n } from "@/config/i18n";
import { useCart } from "@/hooks/useCart";
import { Link } from "@/components/Link";
import { TextWithIcon } from "@/components/TextWithIcon";
import { FA_ICONS } from "@/lib/faIcons";
import { Separator } from "@/components/Separator";

export function DatasetVersionCard({
  versionData,
  lang: langOverride,
  showPublicActions = true,
}: {
  versionData: Pick<
    DatasetDoc,
    | "criteria"
    | "datasetId"
    | "releaseDate"
    | "typeOfData"
    | "version"
    | "experiments"
    | "humId"
  >;
  lang?: "ja" | "en";
  showPublicActions?: boolean;
}) {
  const { lang: routeLang } = useRouteContext({ from: "/{-$lang}/_layout" });
  const { user } = useRouteContext({ from: "__root__" });
  const lang = langOverride ?? routeLang ?? i18n.defaultLocale;
  const t = useTranslations("Dataset");

  const infoKeyValues = [
    { title: t("releaseDate"), value: versionData.releaseDate },
    {
      title: t("research"),
      value: (
        <Link
          to="/{-$lang}/data-use/research/$humId"
          params={{ humId: versionData.humId }}
        >
          <TextWithIcon icon={FA_ICONS.books}>{versionData.humId}</TextWithIcon>
        </Link>
      ),
    },
    { title: t("typeOfData"), value: versionData.typeOfData?.[lang] ?? "—" },
    { title: t("criteria"), value: versionData.criteria },
  ];

  const navigate = useNavigate();
  const currentLocation = useLocation();

  const { add, cart } = useCart();

  const isInCart = cart.some(
    (item) => item.datasetId === versionData.datasetId,
  );

  const handleAddToCart = () => {
    if (!user) {
      void navigate({
        to: "/auth/login",
        search: {
          redirect: `${currentLocation.href}${currentLocation.searchStr ? "&" : "?"}addToCart=${versionData.datasetId}`,
        },
        reloadDocument: true,
      });
      return;
    }
    add(versionData as DatasetDoc);
  };

  const identifier =
    [versionData.datasetId, versionData.version].filter(Boolean).join(".") ||
    "Preview";

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
                  to="/{-$lang}/data-use/datasets/$datasetId/versions"
                  params={{ datasetId: versionData.datasetId }}
                  className="text-white no-underline"
                >
                  {t("release-info")}
                </Link>
              ) : null
            }
            right={
              showPublicActions ? (
                <div className="flex gap-5">
                  <Button
                    variant={"accent"}
                    className="rounded-full"
                    disabled={!!user && isInCart}
                    onClick={handleAddToCart}
                  >
                    {user
                      ? isInCart
                        ? t("already-in-cart")
                        : t("add-to-cart")
                      : t("login-to-add")}
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
          {/*<div className="break-inside-avoid-column">
            <KeyValueCard
              title={t("releaseDate")}
              value={versionData.releaseDate}
            ></KeyValueCard>
            <Separator show variant={"solid"} />
          </div>

          <KeyValueCard title={t("date-modified")}>
            <p>{versionData.releaseDate}</p>
          </KeyValueCard>

          <div className="break-inside-avoid-column">
            <KeyValueCard
              title={t("typeOfData")}
              value={versionData.typeOfData?.[lang] ?? "—"}
            />
            <Separator show variant={"solid"} />
          </div>

          <KeyValueCard title={t("criteria")} value={t(versionData.criteria)} />*/}
          {infoKeyValues.map((info) => (
            <div key={info.title} className="break-inside-avoid-column">
              <KeyValueCard title={info.title} value={info.value} />
              <Separator show variant={"solid"} />
            </div>
          ))}
        </dl>
        <ContentHeader>{t("experiments")}</ContentHeader>
        {versionData.experiments.map((e, i) => (
          <Experiment key={i} experiment={e} />
        ))}
      </section>
    </CardWithCaption>
  );
}

function Experiment({
  experiment,
}: {
  experiment: DatasetDoc["experiments"][number];
}) {
  const lang = useLocale();
  return (
    <section>
      <h2 className="from-secondary-light to-secondary-lighter rounded-t-md bg-linear-to-r px-7 pt-5 pb-4 text-white">
        {experiment.header[lang]?.text}
      </h2>

      <dl className="columns-2 space-y-6 border-x border-b border-gray-300 p-6">
        {Object.entries(experiment.data).map(([title, content]) => (
          <KeyValueCard
            key={title}
            title={title}
            value={content?.[lang]?.rawHtml}
          />
        ))}
      </dl>
    </section>
  );
}
