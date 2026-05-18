import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useLocale, useTranslations } from "use-intl";

import SubmitDataIcon from "@/assets/submit-data.svg?react";
import UseDataIcon from "@/assets/use-data.svg?react";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
import { getNewsTitlesQueryOptions } from "@/serverFunctions/news";

import { ErrorResetBoundary } from "@/components/ErrorResetBoundary";
import { SkeletonLoading } from "@/components/Skeleton";
import { News } from "../../-components/FrontNews";
import searchSamples from "@/config/frontpageSearchSamples.json";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_home")({
  component: RouteComponent,
  loader: async ({ context }) => {
    context.queryClient.ensureQueryData(
      getNewsTitlesQueryOptions({ locale: context.lang }),
    );
  },
  errorComponent: () => <div>Oh no, an error!</div>,
});

function RouteComponent() {
  const navigate = Route.useNavigate();
  const lang = useLocale();
  const t = useTranslations("Front");
  const tCommon = useTranslations("common");
  const [query, setQuery] = useState("");

  function handleSearch() {
    if (!query.trim()) return;
    navigate({ to: "/{-$lang}/research", search: { query: query.trim() } });
  }

  return (
    // All that after the Navbar component
    <section className="flex w-full flex-col items-stretch gap-8">
      <section className="flex h-fit items-start justify-between gap-4">
        <div className="prose-h1:text-secondary prose-h1:text-lg prose-h1:font-bold prose-h1:w-full prose-h1:text-left prose-h1:mt-8 prose-h1:mb-0 flex flex-1 flex-col items-center rounded-md bg-white p-8 pb-24">
          <div className="flex w-full max-w-5xl flex-col items-center">
            <Outlet />

            <div className="mt-8 grid w-full max-w-full grid-cols-[auto_1fr] grid-rows-2 items-center gap-x-8 rounded-md bg-black/15 p-8 text-base">
              <p>{tCommon("search")}</p>

              <Input
                type="text"
                className="flex-1 py-2 pr-0 pl-8"
                placeholder={tCommon("search")}
                value={query}
                afterIcon={
                  <Button
                    variant="accent"
                    size="default"
                    className="pointer-events-auto gap-2 rounded-full px-8 py-3 text-sm"
                    onClick={handleSearch}
                  >
                    <Search size={18} />
                  </Button>
                }
                onChange={(e) => {
                  setQuery(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSearch();
                  }
                }}
              />
              <div className="ga-3 col-start-2 flex gap-4 text-xs">
                {searchSamples[lang]?.map((sample, i) => (
                  <Button
                    onClick={() => {
                      navigate({
                        to: "/{-$lang}/research",
                        search: { query: sample.query },
                      });
                    }}
                    variant={"tableAction"}
                    key={i}
                  >
                    {sample.query}
                  </Button>
                ))}
              </div>
            </div>

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

        <Card
          caption={"News"}
          containerClassName="px-3"
          className="w-[30rem] shrink-0"
        >
          <ErrorResetBoundary getResetKey={() => "reset"}>
            <Suspense fallback={<SkeletonLoading />}>
              <News />
            </Suspense>
          </ErrorResetBoundary>
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
