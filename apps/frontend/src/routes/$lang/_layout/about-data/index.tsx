import { createFileRoute } from "@tanstack/react-router";
import { getContent } from "@/serverFunctions/getContent";
import { RenderableTreeNode } from "@markdoc/markdoc";

import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";

export const Route = createFileRoute("/$lang/_layout/about-data/")({
  component: About,
  loader: async ({ context }) => {
    const content: RenderableTreeNode = await getContent({
      data: { contentName: "about", lang: context.lang },
    });

    return {
      content,
    };
  },
});

function About() {
  const { content } = Route.useLoaderData();

  return <RenderMarkdoc className="mx-auto mt-8" content={content} />;
}
