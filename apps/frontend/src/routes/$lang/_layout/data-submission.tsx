import { Card } from "@/components/Card";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getContent } from "@/serverFunctions/getContent";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$lang/_layout/data-submission")({
  component: RouteComponent,
  loader: async ({ context }) => {
    const { content, frontmatter } = await getContent({
      data: {
        contentId: "data-submission",

        lang: context.lang,
      },
    });

    return {
      content,
      frontmatter,
      crumb: "Data Submission",
    };
  },
  context({ context }) {
    return {
      crumb: "Data Submission",
    };
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
