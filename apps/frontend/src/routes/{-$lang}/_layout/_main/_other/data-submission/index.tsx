import { createFileRoute } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import { Card } from "@/components/Card";
import { MarkdownWithTOC } from "@/components/MarkdownWithTOC";
import { Markdown } from "@/components/Merkdown";
import { PreviousVersionsList } from "@/components/PreviousVersionsList";
import { Button } from "@/components/ui/button";
import {
  $getLatestPublishedDocumentVersion,
  $getPublishedDocumentVersionList,
} from "@/serverFunctions/documentVersion";
import { renderMarkdown } from "@/utils/markdown";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/data-submission/")({
  component: RouteComponent,
  loader: async ({ context }) => {
    const data = await $getLatestPublishedDocumentVersion({
      data: { contentId: "data-submission", locale: context.lang },
    });

    const versions = await $getPublishedDocumentVersionList({
      data: { contentId: "data-submission", locale: context.lang },
    });

    const contentHtml = await renderMarkdown(data.content ?? "");

    return { contentHtml, versions, title: data.title };
  },
});

function RouteComponent() {
  const { contentHtml, versions, title } = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const t = useTranslations("Navbar");
  const tCommon = useTranslations("common");

  return (
    <MarkdownWithTOC
      title={title}
      markdownResult={contentHtml}
      previousVersions={versions}
      revisionsBasePath="data-submission"
      afterContent={
        <div className="my-5 flex justify-center">
          <Button
            className="text-3xl"
            size="lg"
            onClick={() => {
              navigate({ to: "./navigation" });
            }}
          >
            {tCommon("to-", { place: t("data-submission").toLowerCase() })}
          </Button>
        </div>
      }
    />
  );
}
