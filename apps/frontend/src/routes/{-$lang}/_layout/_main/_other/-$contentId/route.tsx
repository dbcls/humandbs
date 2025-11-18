import { Card } from "@/components/Card";
import { i18n } from "@/config/i18n-config";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getDocumentLatestPublishedVersionTranslationQueryOptions } from "@/serverFunctions/documentVersionTranslation";
import { createFileRoute, redirect } from "@tanstack/react-router";
import z from "zod";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/$contentId"
)({
  component: RouteComponent,
  params: z.object({
    contentId: z.string(),
  }),
  loader: async ({ params, context }) => {
    console.log("document contentId", params.contentId);
    const content = await context.queryClient.ensureQueryData(
      getDocumentLatestPublishedVersionTranslationQueryOptions({
        contentId: params.contentId,
        locale: context.lang,
      })
    );

    return { ...content, crumb: context.messages.Navbar[params.contentId] };
  },
  notFoundComponent: () => <h3>Not found</h3>,
  errorComponent: ({ error }) => <h4>{error.message}</h4>,
});

function RouteComponent() {
  const { content, title } = Route.useLoaderData();
  return (
    <Card caption={title} captionSize={"lg"}>
      <RenderMarkdoc className="mx-auto" content={content} />
    </Card>
  );
}
