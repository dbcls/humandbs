import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getContent } from "@/serverFunctions/getContent";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$lang/_layout/data-usage/")({
  component: RouteComponent,
  loader: async ({ context }) => {
    const content = await getContent({
      data: { contentName: "data-usage", lang: context.lang },
    });
    return { content };
  },
});
1;
function RouteComponent() {
  const { content } = Route.useLoaderData();

  return <RenderMarkdoc className="mx-auto mt-8" content={content} />;
}
