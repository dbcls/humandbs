"use client";

import { useEffect, useState } from "react";

import type { MarkdownHeading } from "@/utils/markdown";

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
    <div className="border-secondary static flex w-96 min-w-44 flex-col gap-4 rounded bg-white p-2 md:sticky md:top-4 md:mt-6 md:max-h-[calc(100vh-2rem)] md:overflow-y-auto">
      {headingsToShow.map((heading) => (
        <a
          key={heading.id}
          href={`#${heading.id}`}
          className={`text-sm hover:text-gray-700 ${activeId === heading.id ? "font-semibold text-gray-900" : "font-medium text-gray-500"}`}
        >
          {heading.text}
        </a>
      ))}
    </div>
  );
}
