import { getContent } from "@/serverFunctions/getContent";
import { createFileRoute } from "@tanstack/react-router";

import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";

export const Route = createFileRoute("/_main/$lang/_layout/about-data/")({
  component: About,
  loader: async ({ context }) => {
    const content = await getContent({
      data: { contentId: "data-usage", lang: context.lang },
    });

    return { ...content, crumb: context.messages.Navbar["about-data"] };
  },
});

function About() {
  const { content } = Route.useLoaderData();

  return <RenderMarkdoc content={content} />;
}
