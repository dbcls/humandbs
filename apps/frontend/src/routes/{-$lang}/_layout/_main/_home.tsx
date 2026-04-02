import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import { Card } from "@/components/Card";
import { FrontStatsVisualization } from "@/components/FrontStatsVisualization";
import { Button } from "@/components/ui/button";
import { getNewsTitlesQueryOptions } from "@/serverFunctions/news";

import { News } from "../../-components/FrontNews";
import ArrowIcon from "@/assets/icons/arrow.svg?react";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_home")({
  component: RouteComponent,
  loader: async ({ context }) => {
    const newsTitles = await context.queryClient.ensureQueryData(
      getNewsTitlesQueryOptions({ locale: context.lang }),
    );

    return { newsTitles };
  },
  errorComponent: () => <div>Oh no, an error!</div>,
});

function RouteComponent() {
  const navigate = Route.useNavigate();

  const t = useTranslations("Front");

  return (
    // All that after the Navbar component
    <section className="flex flex-col gap-8 max-w-content-max-width mx-auto">
      <section className="flex h-fit items-start justify-between gap-8">
        <div className="flex flex-1 flex-col items-center prose-h1:text-secondary prose-h1:text-lg prose-h1:mt-8 prose-h1:mb-16">
          <Outlet />
          <div className="mt-8 flex flex-wrap justify-center gap-4 [&_button>svg]:ml-4">
            <Button
              variant={"accent"}
              onClick={() => {
                navigate({ to: "/{-$lang}/data-submission" });
              }}
              size={"xl"}
              className="w-[27rem] h-[6.8rem] block text-center"
            >
              <span>{t("data-submission-button")}</span>
              <ArrowIcon className="inline" />
            </Button>

            <Button
              variant={"action"}
              size={"xl"}
              className="w-[27rem] h-[6.8rem] block text-center"
              onClick={() => {
                navigate({ to: "/{-$lang}/data-use" });
              }}
            >
              <span>{t("data-usage-button")}</span>
              <ArrowIcon className="inline" />
            </Button>
          </div>
        </div>

        <Card caption={"News"} className="w-96 shrink-0">
          <News />
        </Card>
      </section>
      <Card className="overflow-hidden p-0 bg-transparent">
        <FrontStatsVisualization />
      </Card>
    </section>
  );
}
