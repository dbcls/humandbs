import { Card } from "@/components/Card";
import { normalizeSplat } from "@/lib/router-utils";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getContentTranslationQueryOptions } from "@/serverFunctions/contentItem";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/$")({
  component: RouteComponent,

  loader: async ({ params, context }) => {
    const content = await context.queryClient.ensureQueryData(
      getContentTranslationQueryOptions({
        id: params._splat,
        lang: context.lang,
      })
    );

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
