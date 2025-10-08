import { Card } from "@/components/Card";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getContentTranslationQueryOptions } from "@/serverFunctions/contentItem";
import { getDocumentLatestPublishedVersionTranslationQueryOptions } from "@/serverFunctions/documentVersionTranslation";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/$lang/_layout/content/$")({
  component: RouteComponent,
  loader: async ({ params, context }) => {
    if (!params._splat) {
      throw new Error("Missing content ID");
    }

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
