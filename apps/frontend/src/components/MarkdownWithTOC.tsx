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
    <Card className="w-full py-6" containerClassName="pb-10">
      <div className="prose mx-auto prose-a:text-secondary-light prose-a:visited:text-secondary-lighter flex justify-center gap-5 prose-h1:text-secondary prose-h1:font-medium prose-h1:mt-8 prose-h1:mb-16">
        <div className="flex-1">
          {title && <h1>{title}</h1>}
          <Markdown contentHtml={markdownResult} />
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
      </div>
    </Card>
  );
}
