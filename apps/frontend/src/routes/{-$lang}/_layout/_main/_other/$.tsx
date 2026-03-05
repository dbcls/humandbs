import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { Card } from "@/components/Card";
import { Markdown } from "@/components/Merkdown";
import { contentIdSchema } from "@/config/content-config";
import { DOCUMENT_VERSION_STATUS } from "@/db/schema";
import { $getContentItemTranslation } from "@/serverFunctions/contentItem";
import {
  $getLatestDocumentOrContent,
  $getLatestPublishedDocumentVersion,
} from "@/serverFunctions/documentVersion";
import { renderMarkdown } from "@/utils/markdown";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/$")({
  component: RouteComponent,
  params: z.object({
    _splat: z.string(),
  }),
  loader: async ({ params, context }) => {
    // const parsedContentId = contentIdSchema.safeParse(params._splat);

    const data = await $getLatestDocumentOrContent({
      data: { id: params._splat, lang: context.lang },
    });

    const contentHtml = await renderMarkdown(data.content ?? "");

    return { contentHtml, title: data.title };
  },
  errorComponent: ({ error }) => (
    <div>
      <h3>Page not found</h3>
      {error.message}
    </div>
  ),
});

function RouteComponent() {
  const { contentHtml, title } = Route.useLoaderData();

  return (
    <Card caption={title} captionSize={"lg"}>
      <Markdown className="mx-auto" contentHtml={contentHtml} />
    </Card>
  );
}
