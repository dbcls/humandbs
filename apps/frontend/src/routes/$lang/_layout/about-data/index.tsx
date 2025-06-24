import { createFileRoute } from "@tanstack/react-router";

import { Markdown } from "@/components/Markdown";
import { getContent } from "@/serverFunctions/getContent";
import { getLocale } from "@/paraglide/runtime";
// import aboutContent from "@/content/about-content.md";

export const Route = createFileRoute("/$lang/_layout/about-data/")({
  component: About,
  loader: async ({ context }) => {
    const content = await getContent({
      data: { contentName: "about", lang: context.lang },
    });

    return {
      content,
      crumb: "About",
    };
  },
});

function About() {
  const { content } = Route.useLoaderData();

  return (
    <div>
      About
      <Markdown markdown={content} />
    </div>
  );
}
