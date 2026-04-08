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
  title: string | null;
  markdownResult: MarkdownResult;
  previousVersions?: DocPublishedVersionListItemResponse[];
  afterContent?: React.ReactNode;
  hideTOC?: boolean;
}) {
  return (
    <Card
      className="w-full py-6"
      containerClassName="py-10 mx-auto flex justify-center gap-5 "
    >
      <div>
        <Markdown contentHtml={markdownResult} title={title} />
        {previousVersions && (
          <PreviousVersionsList
            versions={previousVersions}
            slug="/{-$lang}/guidelines"
          />
        )}
        {afterContent}
      </div>
      {markdownResult.headings.length > 0 && !hideTOC ? (
        <TOC headings={markdownResult.headings} />
      ) : null}
    </Card>
  );
}
