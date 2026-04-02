import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { MarkdownWithTOC } from "@/components/MarkdownWithTOC";
import { $getLatestDocumentOrContent } from "@/serverFunctions/documentVersion";
import { renderMarkdown } from "@/utils/markdown";

const humIdPathSchema = z.string().regex(/^hum\d+$/i);

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/$")({
  component: RouteComponent,
  params: z.object({
    _splat: z.string(),
  }),
  loader: async ({ params, context }) => {
    const parsedHumId = humIdPathSchema.safeParse(params._splat);

    if (parsedHumId.success) {
      throw redirect({
        to: "/{-$lang}/data-use/research/$humId",
        params: {
          lang: context.lang,
          humId: parsedHumId.data,
        },
      });
    }

    // const parsedContentId = contentIdSchema.safeParse(params._splat);

    const data = await $getLatestDocumentOrContent({
      data: { id: params._splat, lang: context.lang },
    });

    const contentHtml = await renderMarkdown(data.content ?? "");

    return { contentHtml, title: data.title, crumb: data.title };
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

  return <MarkdownWithTOC title={title} markdownResult={contentHtml} />;
}
