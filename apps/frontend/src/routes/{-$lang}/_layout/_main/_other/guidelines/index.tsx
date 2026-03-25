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
import { MarkdownWithTOC } from "@/components/MarkdownWithTOC";

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
    <MarkdownWithTOC
      title={title}
      markdownResult={contentHtml}
      previousVersions={versions}
    />
  );
}
