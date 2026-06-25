import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Download, Upload } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";

import { lazy, Suspense, useState } from "react";

import { Card } from "@/components/Card";
import { ErrorResetBoundary } from "@/components/ErrorResetBoundary";
import { Input } from "@/components/Input";
import { SearchIcon } from "@/components/SearchIcon";
import { SkeletonLoading } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
import searchSamples from "@/config/frontpageSearchSamples.json";
import { getNewsTitlesQueryOptions } from "@/serverFunctions/news";

import { News } from "../../-components/FrontNews";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_home")({
  component: RouteComponent,
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(getNewsTitlesQueryOptions({ locale: context.lang }));
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
    <section className="flex w-full flex-col items-stretch gap-4">
      <section className="flex h-fit items-start justify-between gap-4">
        <div className="prose-h1:mt-8 prose-h1:mb-0 flex prose-h1:w-full flex-1 flex-col items-center rounded-md bg-white p-8 pb-24 prose-h1:text-left prose-h1:font-bold prose-h1:text-lg prose-h1:text-secondary">
          <div className="flex w-full max-w-5xl flex-col items-center">
            <Outlet />

            <div className="mt-8 flex w-full max-w-full flex-col gap-3 text-base">
              <Input
                type="text"
                className="w-full h-20 py-2 pr-0 pl-8"
                placeholder={t("search-placeholder")}
                value={query}
                afterIcon={
                  <Button
                    variant="accent"
                    size="icon"
                    className="pointer-events-auto aspect-square h-14 rounded-full p-0 flex items-center justify-center mr-1"
                    onClick={handleSearch}
                    aria-label={tCommon("search")}
                  >
                    <SearchIcon size={18} />
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
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                <span className="font-medium text-muted-foreground">{t("search-keywords")}</span>
                {searchSamples[lang]?.map((sample) => (
                  <Button
                    onClick={() => {
                      navigate({
                        to: "/{-$lang}/research",
                        search: { query: sample.query },
                      });
                    }}
                    variant={"tableAction"}
                    key={sample.query}
                  >
                    {sample.query}
                  </Button>
                ))}
              </div>
            </div>

            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Button
                variant={"accent"}
                onClick={() => {
                  navigate({ to: "/{-$lang}/data-submission" });
                }}
                className="flex h-32 w-[27rem] flex-col items-center gap-1.5 rounded-2xl pt-5 font-bold text-base shadow-md transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
              >
                <Upload className="h-10 w-10 shrink-0" />
                <span>{t("data-submission-button")}</span>
              </Button>

              <Button
                variant={"action"}
                className="flex h-32 w-[27rem] flex-col items-center gap-1.5 rounded-2xl pt-5 font-bold text-base shadow-md transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
                onClick={() => {
                  navigate({ to: "/{-$lang}/data-use" });
                }}
              >
                <Download className="h-10 w-10 shrink-0" />
                <span>{t("data-usage-button")}</span>
              </Button>
            </div>
          </div>
        </div>

        <Card caption={"News"} containerClassName="px-3" className="w-[30rem] shrink-0">
          <ErrorResetBoundary getResetKey={() => "reset"}>
            <Suspense fallback={<SkeletonLoading />}>
              <News />
            </Suspense>
          </ErrorResetBoundary>
        </Card>
      </section>
      <div className="w-full">
        <Suspense
          fallback={<div className="flex h-40 w-full items-center justify-center">Loading...</div>}
        >
          <LazyFrontStats />
        </Suspense>
      </div>
    </section>
  );
}

const LazyFrontStats = lazy(() => import("@/components/FrontStatsVisualization/index"));
