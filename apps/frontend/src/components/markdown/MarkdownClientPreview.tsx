import { useEffect, useState } from "react";

import type { MarkdownResult } from "@/utils/markdown";
import { renderMarkdown } from "@/utils/markdown";

import { Markdown } from ".";

/**
 * Markdown rendered on client side - for CMS
 */
export default function MarkdownClientPreview({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const [contentHtml, setContentHtml] = useState<MarkdownResult>();

  const [error, setError] = useState(false);

  useEffect(() => {
    renderMarkdown(source)
      .then(setContentHtml)
      .catch(() => {
        setError(true);
      });
  }, [source, setContentHtml, setError]);

  if (error) return <div>Some error occurred. Markdown couldn't be previewed </div>;

  return (
    <section className="w-full">
      <Markdown className={className} contentHtml={contentHtml ?? { markup: "", headings: [] }} />
    </section>
  );
}
