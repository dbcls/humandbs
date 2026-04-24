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
  hideTOC,
}: {
  title: React.ReactNode | string | null;
  markdownResult: MarkdownResult;
  previousVersions?: DocPublishedVersionListItemResponse[];
  afterContent?: React.ReactNode;
  hideTOC?: boolean;
}) {
  const showTOC = markdownResult.headings.length > 0 && !hideTOC;
  return (
    <Card
      className="w-full min-w-0 py-6"
      containerClassName="main-content mt-8 min-w-0"
    >
      <div className="flex gap-8">
        {showTOC ? <TOC headings={markdownResult.headings} /> : null}
        <div className="flex-1">
          <Markdown contentHtml={markdownResult} title={title} />
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
