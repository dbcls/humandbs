import { Card } from "@/components/Card";
import { MarkdocTOC } from "@/markdoc/MarkdocTOC";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getContent } from "@/serverFunctions/getContent";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

export const Route = createFileRoute(
  "/$lang/_layout/guidelines/security-for-submitters/"
)({
  component: RouteComponent,
  loader: async ({ context }) => {
    const { content, headings, frontmatter } = await getContent({
      data: {
        contentName: "security-guidelines-for-submitters",
        lang: context.lang,
        generateTOC: true,
      },
    });

    return {
      content,
      headings,
      frontmatter,
    };
  },
});

function RouteComponent() {
  const { content, headings, frontmatter } = Route.useLoaderData();

  return (
    <Card caption={frontmatter.title} captionSize={"lg"}>
      <div className="relative flex flex-col items-stretch gap-4 md:flex-row md:items-start">
        <MarkdocTOC headings={headings} />
        <RenderMarkdoc className="mx-auto mt-8" content={content} />
      </div>
    </Card>
  );
}
