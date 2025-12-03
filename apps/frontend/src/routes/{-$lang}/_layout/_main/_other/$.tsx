import { Card } from "@/components/Card";
import { DOCUMENT_VERSION_STATUS } from "@/db/schema";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getContentTranslationQueryOptions } from "@/serverFunctions/contentItem";
import { createFileRoute } from "@tanstack/react-router";
import z from "zod";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/$")({
  component: RouteComponent,
  params: z.object({
    _splat: z.string(),
  }),
  loader: async ({ params, context }) => {
    console.log("document id", params._splat);
    const content = await context.queryClient.ensureQueryData(
      getContentTranslationQueryOptions({
        id: params._splat,
        lang: context.lang,
        status: DOCUMENT_VERSION_STATUS.PUBLISHED,
      })
    );

    console.log("content", content);

    return content;
  },
  errorComponent: ({ error }) => (
    <div>
      <h3>Page not found</h3>
      {error.message}
    </div>
  ),
});

function RouteComponent() {
  const { content, title } = Route.useLoaderData();

  return (
    <Card caption={title} captionSize={"lg"}>
      <RenderMarkdoc className="mx-auto" content={content || ""} />
    </Card>
  );
}
