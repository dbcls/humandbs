import { Card } from "@/components/Card";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getContent } from "@/serverFunctions/getContent";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/$lang/_layout/data-usage/")({
  component: RouteComponent,
  loader: async ({ context }) => {
    const content = await getContent({
      data: { contentId: "data-usage", lang: context.lang },
    });

    return { ...content };
  },
});

function RouteComponent() {
  const { content, frontmatter } = Route.useLoaderData();

  return (
    <Card caption={frontmatter.title} captionSize={"lg"}>
      <RenderMarkdoc className="mx-auto" content={content} />;
    </Card>
  );
}
