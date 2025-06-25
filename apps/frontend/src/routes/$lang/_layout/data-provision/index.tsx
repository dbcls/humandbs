import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getContent } from "@/serverFunctions/getContent";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$lang/_layout/data-provision/")({
  component: RouteComponent,
  loader: ({ context }) =>
    getContent({
      data: { contentName: "data-submission", lang: context.lang },
    }),
});

function RouteComponent() {
  const content = Route.useLoaderData();

  return <RenderMarkdoc className="mx-auto mt-8" content={content} />;
}
