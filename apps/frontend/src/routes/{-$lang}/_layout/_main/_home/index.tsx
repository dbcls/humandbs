import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/Input";
import { Markdown } from "@/components/Merkdown";
import { $getLatestPublishedDocumentVersion } from "@/serverFunctions/documentVersion";
import { renderMarkdown } from "@/utils/markdown";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_home/")({
  component: RouteComponent,
  loader: async ({ context }) => {
    const data = await $getLatestPublishedDocumentVersion({
      data: { contentId: "home", locale: context.lang },
    });

    const contentHtml = await renderMarkdown(data.content ?? "");

    return { contentHtml, title: data.title };
  },
});

function RouteComponent() {
  const { contentHtml, title } = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const [query, setQuery] = useState("");

  return (
    <>
      <h1>{title}</h1>

      <Input
        type="text"
        className="mb-4 w-full max-w-4xl"
        value={query}
        beforeIcon={<Search size={18} />}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim()) {
            navigate({
              to: "/{-$lang}/dataset",
              search: { query: query.trim() },
            });
          }
        }}
      />

      <Markdown contentHtml={contentHtml} />
    </>
  );
}
