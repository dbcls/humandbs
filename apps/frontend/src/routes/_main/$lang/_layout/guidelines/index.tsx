import { Card } from "@/components/Card";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getContent } from "@/serverFunctions/getContent";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/$lang/_layout/guidelines/")({
  component: RouteComponent,
  loader: async ({ context }) => {
    const data = await getContent({
      data: { contentId: "guidelines", lang: context.lang },
    });

    return data;
  },
});

function RouteComponent() {
  const { content, frontmatter } = Route.useLoaderData();

  return (
    <Card caption={frontmatter.title} captionSize={"lg"}>
      <RenderMarkdoc className="mx-auto" content={content} />
    </Card>
  );
}
