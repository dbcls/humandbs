"use client";

import { useEffect, useState } from "react";

import type { MarkdownHeading } from "@/utils/markdown";
import { cn } from "@/lib/utils";

export function TOC({ headings }: { headings: MarkdownHeading[] | null }) {
  const headingsToShow =
    headings?.filter((heading) => heading.level <= 2) || [];

  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (headingsToShow.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "0px 0px -80% 0px", threshold: 0 },
    );

    for (const heading of headingsToShow) {
      const el = document.getElementById(heading.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [headingsToShow.map((h) => h.id).join(",")]);

  return (
    <div className="static not-prose flex w-96 min-w-44 shrink-0 flex-col gap-4 rounded p-2 md:sticky md:top-4 md:mt-6 md:max-h-[calc(100vh-2rem)] md:overflow-y-auto">
      {headingsToShow.map((heading) => (
        <a
          key={heading.id}
          href={`#${heading.id}`}
          className={cn(
            "text-sm no-underline hover:text-neutral-800 text-neutral-500 font-medium",
            {
              "font-bold text-neutral-900": activeId === heading.id,
            },
          )}
        >
          {heading.text}
        </a>
      ))}
    </div>
  );
}
