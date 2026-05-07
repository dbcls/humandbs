import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import { Card } from "@/components/Card";

import { Button } from "@/components/ui/button";
import { getNewsTitlesQueryOptions } from "@/serverFunctions/news";

import { News } from "../../-components/FrontNews";
import ArrowIcon from "@/assets/icons/arrow.svg?react";
import SubmitDataIcon from "@/assets/submit-data.svg?react";
import UseDataIcon from "@/assets/use-data.svg?react";
import { lazy } from "react";

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
    <section className="w-full flex flex-col items-stretch gap-8">
      <section className="flex h-fit items-start justify-between gap-4">
        <div className="prose-h1:text-secondary prose-h1:text-lg prose-h1:font-bold prose-h1:w-full prose-h1:text-left prose-h1:mt-8 prose-h1:mb-0 flex flex-1 flex-col items-center rounded-md bg-white p-8 pb-12">
          <div className="w-full max-w-5xl flex flex-col items-center">
            <Outlet />

            <div className="mt-8 flex flex-wrap justify-center gap-4 [&_button>svg]:ml-4">
              <Button
                variant={"accent"}
                onClick={() => {
                  navigate({ to: "/{-$lang}/data-submission" });
                }}
                size={"xl"}
                className="relative block h-[6.8rem] w-[27rem] text-center"
              >
                <span>{t("data-submission-button")}</span>

                <SubmitDataIcon className="absolute right-2 bottom-2 h-auto w-40" />
              </Button>

              <Button
                variant={"action"}
                size={"xl"}
                className="relative block h-[6.8rem] w-[27rem] text-center"
                onClick={() => {
                  navigate({ to: "/{-$lang}/data-use" });
                }}
              >
                <span>{t("data-usage-button")}</span>
                <UseDataIcon className="absolute bottom-2 left-0 h-auto w-40" />
              </Button>
            </div>
          </div>
        </div>

        <Card caption={"News"} className="w-[30rem] shrink-0">
          <News />
        </Card>
      </section>
      <Card className="overflow-hidden bg-transparent p-0">
        <LazyFrontStats />
      </Card>
    </section>
  );
}

const LazyFrontStats = lazy(
  () => import("@/components/FrontStatsVisualization"),
);
