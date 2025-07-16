import { Card } from "@/components/Card";
import { CONTENT_IDS } from "@/lib/content-config";
import { enumFromStringArray } from "@/lib/utils";
import { MarkdocTOC } from "@/markdoc/MarkdocTOC";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getContent } from "@/serverFunctions/getContent";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/$lang/_layout/guidelines/$slug")({
  component: RouteComponent,
  params: z.object({ slug: enumFromStringArray(CONTENT_IDS.guidelines) }),
  loader: async ({ context, params }) => {
    const data = await getContent({
      data: { contentId: params.slug, lang: context.lang, generateTOC: true },
    });

    return data;
  },
  context({ params }) {
    return {
      crumb: params.slug,
    };
  },
});

function RouteComponent() {
  const { frontmatter, content, headings } = Route.useLoaderData();

  console.log("hello component");
  return (
    <Card caption={frontmatter.title} captionSize={"lg"}>
      <div className="relative flex flex-col items-stretch gap-4 md:flex-row md:items-start">
        <MarkdocTOC headings={headings} />
        <RenderMarkdoc content={content} />
      </div>
    </Card>
  );
}
