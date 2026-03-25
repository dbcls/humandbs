import type React from "react";
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
  afterContent,
}: {
  title: string | null;
  markdownResult: MarkdownResult;
  previousVersions?: DocPublishedVersionListItemResponse[];
  afterContent?: React.ReactNode;
}) {
  return (
    <Card className="w-full py-6">
      <div className="relative flex flex-col items-stretch gap-4 md:flex-row md:items-start">
        <TOC headings={markdownResult.headings} />
        <div className="mx-auto w-full max-w-6xl min-w-0">
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
          {afterContent}
        </div>
      </div>
    </Card>
  );
}
