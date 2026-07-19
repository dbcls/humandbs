import { useTranslations } from "use-intl";

import { useEffect, useState } from "react";

import type { MarkdownResult } from "@/utils/markdown";
import { renderMarkdown } from "@/utils/markdown";

import { Markdown } from "./index";

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
  const tMarkdown = useTranslations("admin.markdown");
  const [contentHtml, setContentHtml] = useState<MarkdownResult>();

  const [error, setError] = useState(false);

  useEffect(() => {
    renderMarkdown(source)
      .then(setContentHtml)
      .catch(() => {
        setError(true);
      });
  }, [source]);

  if (error) return <div>{tMarkdown("preview-error")}</div>;

  return (
    <section className="w-full">
      <Markdown className={className} contentHtml={contentHtml ?? { markup: "", headings: [] }} />
    </section>
  );
}
