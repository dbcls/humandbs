import { useEffect, useState } from "react";

import { renderMarkdown, type MarkdownResult } from "@/utils/markdown";

import { Markdown } from "../Merkdown";

/**
 * Markdown rendered on client side - for CMS
 */
export function MarkdownClientPreview({ source }: { source: string }) {
  const [contentHtml, setContentHtml] = useState<MarkdownResult>();

  const [error, setError] = useState(false);

  useEffect(() => {
    renderMarkdown(source)
      .then(setContentHtml)
      .catch(() => {
        setError(true);
      });
  }, [source, setContentHtml, setError]);

  if (error)
    return <div>Some error occurred. Markdown couldn't be previewed </div>;

  return <Markdown contentHtml={contentHtml ?? { markup: "", headings: [] }} />;
}
