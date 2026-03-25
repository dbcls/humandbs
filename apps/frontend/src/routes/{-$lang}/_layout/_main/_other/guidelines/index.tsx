import { createFileRoute } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import { Card } from "@/components/Card";
import { Markdown } from "@/components/Merkdown";
import { PreviousVersionsList } from "@/components/PreviousVersionsList";
import { TOC } from "@/components/TOC";
import {
  $getLatestPublishedDocumentVersion,
  $getPublishedDocumentVersionList,
} from "@/serverFunctions/documentVersion";
import { renderMarkdown } from "@/utils/markdown";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/guidelines/",
)({
  component: RouteComponent,
  loader: async ({ context }) => {
    const data = await $getLatestPublishedDocumentVersion({
      data: {
        contentId: "guidelines",
        locale: context.lang,
      },
    });

    const versions = await $getPublishedDocumentVersionList({
      data: { contentId: "guidelines", locale: context.lang },
    });

    const contentHtml = await renderMarkdown(data.content ?? "");

    return { contentHtml, versions, title: data.title };
  },
});

function RouteComponent() {
  const { contentHtml, title, versions } = Route.useLoaderData();

  const t = useTranslations("Navbar");
  return (
    <Card className="w-full">
      <div className="relative flex flex-col items-stretch gap-4 md:flex-row md:items-start">
        <TOC headings={contentHtml.headings} />
        <div className="flex-1 min-w-0">
          <div className="prose prose-h1:text-secondary prose-h1:font-medium prose-h1:mb-2 text-base">
            <h1>{title}</h1>
          </div>
          <Markdown contentHtml={contentHtml} />
          <PreviousVersionsList
            versions={versions}
            slug="/{-$lang}/guidelines"
            documentName={t("guidelines")}
          />
        </div>
      </div>
    </Card>
  );
}
