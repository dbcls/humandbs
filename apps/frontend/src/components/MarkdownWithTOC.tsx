import type { DocPublishedVersionListItemResponse } from "@/repositories/documentVersion";
import type { MarkdownResult } from "@/utils/markdown";
import { Card } from "./Card";
import { Markdown } from "./Merkdown";
import { PreviousVersionsList } from "./PreviousVersionsList";
import { TOC } from "./TOC";

export function MarkdownWithTOC({
  title,
  markdownResult,
  previousVersions,
}: {
  title: string | null;
  markdownResult: MarkdownResult;
  previousVersions?: DocPublishedVersionListItemResponse[];
}) {
  return (
    <Card className="w-full py-6">
      <div className="relative flex flex-col items-stretch gap-4 md:flex-row md:items-start">
        <TOC headings={markdownResult.headings} />
        <div className="flex-1 min-w-0">
          {title && (
            <div className="prose prose-h1:text-secondary prose-h1:font-medium prose-h1:mb-2 text-base">
              <h1>{title}</h1>
            </div>
          )}
          <Markdown contentHtml={markdownResult} />
          {previousVersions && (
            <PreviousVersionsList
              versions={previousVersions}
              slug="/{-$lang}/guidelines"
            />
          )}
        </div>
      </div>
    </Card>
  );
}
