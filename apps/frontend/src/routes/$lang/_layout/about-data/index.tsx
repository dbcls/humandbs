import { getContent } from "@/serverFunctions/getContent";
import { createFileRoute } from "@tanstack/react-router";

import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";

export const Route = createFileRoute("/$lang/_layout/about-data/")({
  component: About,
  loader: ({ context }) =>
    getContent({
      data: { contentName: "data-usage", lang: context.lang },
    }),
});

function About() {
  const { content } = Route.useLoaderData();

  return <RenderMarkdoc className="mx-auto mt-8" content={content} />;
}
