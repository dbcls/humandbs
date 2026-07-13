import type React from "react";

import type { DocPublishedVersionListItemResponse } from "@/repositories/documentVersion";
import type { MarkdownResult } from "@/utils/markdown";

import { Card } from "../Card";
import { PreviousVersionsList } from "../PreviousVersionsList";
import { Markdown } from "./index";
import { TOC } from "./TOC";

export function MarkdownWithTOC({
  title,
  markdownResult,
  previousVersions,
  revisionsBasePath,
  afterContent,
  beforeContent,
  topRightAction,
  hideTOC,
}: {
  title: React.ReactNode | string | null;
  markdownResult: MarkdownResult;
  previousVersions?: DocPublishedVersionListItemResponse[];
  revisionsBasePath?: string;
  documentName?: string | null;
  afterContent?: React.ReactNode;
  beforeContent?: React.ReactNode;
  topRightAction?: React.ReactNode;
  hideTOC?: boolean;
}) {
  const showTOC = markdownResult.headings && markdownResult.headings?.length > 0 && !hideTOC;
  return (
    <Card
      className="relative w-full min-w-0 pt-6 pb-20"
      containerClassName="main-content mt-8 min-w-0"
    >
      {topRightAction && <div className="absolute top-6 right-6 z-10">{topRightAction}</div>}
      <div className="flex gap-8">
        {showTOC ? <TOC headings={markdownResult.headings ?? []} /> : null}
        <div className="flex-1">
          {beforeContent}
          <Markdown contentHtml={markdownResult} title={title} />
          {previousVersions && revisionsBasePath && (
            <PreviousVersionsList
              versions={previousVersions}
              revisionsBasePath={revisionsBasePath}
              documentName={typeof title === "string" ? title : undefined}
            />
          )}

          {afterContent}
        </div>
      </div>
    </Card>
  );
}
