import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getContent } from "@/serverFunctions/getContent";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$lang/_layout/data-usage/")({
  component: RouteComponent,
  loader: ({ context }) =>
    getContent({
      data: { contentId: "data-usage", lang: context.lang },
    }),
});

function RouteComponent() {
  const { content } = Route.useLoaderData();

  return <RenderMarkdoc content={content} />;
}
