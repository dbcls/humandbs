import { createFileRoute } from "@tanstack/react-router";

import InfographicsImg from "@/assets/Infographics.png";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/Card";
import { News } from "./-components/FrontNews";
import { localeSchema } from "@/lib/i18n-config";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getDocumentLatestVersionTranslationQueryOptions } from "@/serverFunctions/documentVersionTranslation";
import { ErrorBoundary } from "react-error-boundary";
import { useTranslations } from "use-intl";
import { z } from "zod";
import { getNewsTitlesQueryOptions } from "@/serverFunctions/news";

export const Route = createFileRoute("/_main/$lang/")({
  component: Index,
  params: z.object({
    lang: localeSchema,
  }),

  loader: async ({ context, params }) => {
    const lang = params.lang;

    const { content } = await context.queryClient.ensureQueryData(
      getDocumentLatestVersionTranslationQueryOptions({
        locale: lang,
        contentId: "home",
      })
    );

    const newsTitles = await context.queryClient.ensureQueryData(
      getNewsTitlesQueryOptions({ locale: lang })
    );

    return { content, newsTitles };
  },
});

function Index() {
  const navigate = Route.useNavigate();

  const t = useTranslations("Front");

  return (
    // All that after the Navbar component
    <section className="flex flex-col gap-8">
      <section className="flex h-fit items-start justify-between gap-8">
        <div className="flex flex-1 flex-col items-center">
          <ErrorBoundary fallbackRender={(e) => <div>{e.error.message}</div>}>
            <HomeContent />
          </ErrorBoundary>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Button
              variant={"accent"}
              onClick={() => navigate({ to: "/$lang/data-submission" })}
              size={"lg"}
            >
              {t("data-submission-button")}
            </Button>

            <Button
              variant={"action"}
              size={"lg"}
              onClick={() => {
                navigate({ to: "research-list" });
              }}
            >
              {t("data-usage-button")}
            </Button>
          </div>
        </div>

        <Card caption={t("news")} className="w-96 shrink-0">
          <News />
        </Card>
      </section>
      <Card className="overflow-hidden p-0">
        <Infographics />
      </Card>
    </section>
  );
}

function HomeContent() {
  const { content } = Route.useLoaderData();

  return <RenderMarkdoc content={content} />;
}

type InfographicsItem = {
  id: string;
  title: string;
  amount: number;
  parent: string | null;
};

const info: InfographicsItem[] = [
  {
    id: "1",
    title: "NGS",
    amount: 100,
    parent: null,
  },
];

function Infographics() {
  return (
    <img src={InfographicsImg} alt="Infographics" className="w-full"></img>
  );
}
