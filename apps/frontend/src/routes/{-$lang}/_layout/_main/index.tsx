import { createFileRoute } from "@tanstack/react-router";

import InfographicsImg from "@/assets/Infographics.png";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getDocumentLatestPublishedVersionTranslationQueryOptions } from "@/serverFunctions/documentVersionTranslation";
import { getNewsTitlesQueryOptions } from "@/serverFunctions/news";
import { ErrorBoundary } from "react-error-boundary";
import { useTranslations } from "use-intl";
import { News } from "../../-components/FrontNews";

export const Route = createFileRoute("/{-$lang}/_layout/_main/")({
  component: Index,

  loader: async ({ context }) => {
    const { content } = await context.queryClient.ensureQueryData(
      getDocumentLatestPublishedVersionTranslationQueryOptions({
        locale: context.lang,
        contentId: "home",
      })
    );

    const newsTitles = await context.queryClient.ensureQueryData(
      getNewsTitlesQueryOptions({ locale: context.lang })
    );

    return { content, newsTitles };
  },

  errorComponent: ({ error }) => <div>{error.message}</div>,
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
              onClick={() => navigate({ to: "/{-$lang}/data-submission" })}
              size={"lg"}
            >
              {t("data-submission-button")}
            </Button>

            <Button
              variant={"action"}
              size={"lg"}
              onClick={() => {
                navigate({ to: "/{-$lang}/data-usage" });
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
