import { Card } from "@/components/Card";
import { normalizeSplat } from "@/lib/router-utils";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getContentTranslationQueryOptions } from "@/serverFunctions/contentItem";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/$")({
  component: RouteComponent,

  loader: async ({ params, context }) => {
    console.log("context lang", context.lang);
    console.log("params splat", params._splat);

    console.log("params.lang", params.lang);

    let splat = normalizeSplat(params);

    if (!splat) throw new Error("missing path");

    const content = await context.queryClient.ensureQueryData(
      getContentTranslationQueryOptions({
        id: splat,
        lang: context.lang,
      })
    );

    // If lang is distinguashable in path, use lang.
    // If not - try to fetch cnotent
    return content;
  },
  errorComponent: ({ error }) => <div>{error.message}</div>,
});

function RouteComponent() {
  const { content, title } = Route.useLoaderData();

  return (
    <Card caption={title} captionSize={"lg"}>
      <RenderMarkdoc className="mx-auto" content={content || ""} />
    </Card>
  );
}
