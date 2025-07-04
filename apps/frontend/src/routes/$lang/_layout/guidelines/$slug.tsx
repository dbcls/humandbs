import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { enumFromStringArray } from "@/lib/utils";
import { getContent } from "@/serverFunctions/getContent";
import { CONTENT_IDS } from "@/lib/content-config";
import { Card } from "@/components/Card";
import { MarkdocTOC } from "@/markdoc/MarkdocTOC";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";

export const Route = createFileRoute("/$lang/_layout/guidelines/$slug")({
  component: RouteComponent,
  params: z.object({ slug: enumFromStringArray(CONTENT_IDS.guidelines) }),
  loader: async ({ context, params }) => {
    const { content, headings, frontmatter } = await getContent({
      data: {
        contentId: params.slug,
        lang: context.lang,
        generateTOC: true,
      },
    });

    return {
      content,
      headings,
      frontmatter,
      crumb: params.slug,
    };
  },
});

function RouteComponent() {
  const { content, headings, frontmatter } = Route.useLoaderData();

  return (
    <Card caption={frontmatter.title} captionSize={"lg"}>
      <div className="relative flex flex-col items-stretch gap-4 md:flex-row md:items-start">
        <MarkdocTOC headings={headings} />
        <RenderMarkdoc content={content} />
      </div>
    </Card>
  );
}
