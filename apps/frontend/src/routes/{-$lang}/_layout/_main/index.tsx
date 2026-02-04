import { createFileRoute } from "@tanstack/react-router";
import { ErrorBoundary } from "react-error-boundary";
import { useTranslations } from "use-intl";

import InfographicsImg from "@/assets/Infographics.png";
import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { transformMarkdoc } from "@/markdoc/config";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { $getLatestPublishedDocumentVersion } from "@/serverFunctions/documentVersion";
import { getNewsTitlesQueryOptions } from "@/serverFunctions/news";

import { News } from "../../-components/FrontNews";

export const Route = createFileRoute("/{-$lang}/_layout/_main/")({
  component: Index,

  loader: async ({ context }) => {
    const data = await $getLatestPublishedDocumentVersion({
      data: { contentId: "home", locale: context.lang },
    });

    const newsTitles = await context.queryClient.ensureQueryData(
      getNewsTitlesQueryOptions({ locale: context.lang })
    );

    const { content } = transformMarkdoc({ rawContent: data?.content ?? "" });

    return { content: JSON.stringify(content), title: data.title, newsTitles };
  },

  errorComponent: ({ error }) => (
    <section>
      <h2>Oops! Some error has occurred!</h2>
      <h3>{error.name}</h3>
      <code>{error.message}</code>
    </section>
  ),
});

function Index() {
  const { title } = Route.useLoaderData();
  const navigate = Route.useNavigate();

  const t = useTranslations("Front");

  return (
    // All that after the Navbar component
    <section className="flex flex-col gap-8">
      <section className="flex h-fit items-start justify-between gap-8">
        <div className="flex flex-1 flex-col items-center">
          <ErrorBoundary fallbackRender={(e) => <div>{e.error.message}</div>}>
            <h1 className="text-secondary mt-10 mb-5 text-lg font-medium">
              {title}
            </h1>
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
  const { content, title } = Route.useLoaderData();

  return (
    <>
      <h1></h1>
      <RenderMarkdoc content={content} />
    </>
  );
}

function Infographics() {
  return (
    <img src={InfographicsImg} alt="Infographics" className="w-full"></img>
  );
}
