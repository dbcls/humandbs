import { Card } from "@/components/Card";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getDocumentLatestPublishedVersionTranslationQueryOptions } from "@/serverFunctions/documentVersionTranslation";
import { createFileRoute } from "@tanstack/react-router";
import z from "zod";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/$contentId/")({
  component: RouteComponent,
  params: z.object({
    contentId: z.string(),
  }),
  loader: async ({ params, context }) => {
    const content = await context.queryClient.ensureQueryData(
      getDocumentLatestPublishedVersionTranslationQueryOptions({
        contentId: params.contentId,
        locale: context.lang,
      })
    );

    return { ...content, crumb: context.messages.Navbar[params.contentId] };
  },
});

function RouteComponent() {
  const { content, title } = Route.useLoaderData();
  return (
    <Card caption={title} captionSize={"lg"}>
      <RenderMarkdoc className="mx-auto" content={content} />
    </Card>
  );
}
