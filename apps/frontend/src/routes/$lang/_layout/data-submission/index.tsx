import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getContent } from "@/serverFunctions/getContent";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$lang/_layout/data-submission/")({
  component: RouteComponent,
  loader: async ({ context }) => {
    console.log("context.lang", context.lang);
    const { content } = await getContent({
      data: {
        contentName: "data-submission",

        lang: context.lang,
      },
    });

    return {
      content,
      crumb: "Data Submission",
    };
  },
});

function RouteComponent() {
  const { content } = Route.useLoaderData();

  return <RenderMarkdoc className="mx-auto mt-8" content={content} />;
}
