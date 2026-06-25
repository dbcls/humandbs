import { createFileRoute } from "@tanstack/react-router";
import { LucideExternalLink, LucideFilePenLine, LucideNetwork } from "lucide-react";
import { useTranslations } from "use-intl";

import { MarkdownWithTOC } from "@/components/markdown/MarkdownWithTOC";
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
  const t = useTranslations();

  return (
    <MarkdownWithTOC
      title={title}
      markdownResult={contentHtml}
      previousVersions={versions}
      revisionsBasePath="data-submission"
      beforeContent={
        <div className="my-5 flex justify-center gap-4">
          <Button
            className="text-3xl"
            size="lg"
            onClick={() => {
              navigate({ href: DS_NAVIGATION_URL });
            }}
          >
            <LucideNetwork className="mr-2 size-6" />
            {t("Data-submission.to-navigation")}
            <LucideExternalLink className="ml-2 size-6" />
          </Button>

          <Button
            className="text-3xl"
            size="lg"
            onClick={() => {
              navigate({ href: DS_SUBMISSION_URL });
            }}
          >
            <LucideFilePenLine className="mr-2 size-6" />
            {t("Data-submission.to-data-submission")}
            <LucideExternalLink className="ml-2 size-6" />
          </Button>
        </div>
      }
    />
  );
}
