import { createFileRoute } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import { MarkdownWithTOC } from "@/components/MarkdownWithTOC";
import { Button } from "@/components/ui/button";
import { $getLatestPublishedDocumentVersion } from "@/serverFunctions/documentVersion";
import { renderMarkdown } from "@/utils/markdown";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-use/",
)({
  component: RouteComponent,
  loader: async ({ context }) => {
    const data = await $getLatestPublishedDocumentVersion({
      data: {
        contentId: "data-usage",
        locale: context.lang,
      },
    });

    const contentHtml = await renderMarkdown(data.content ?? "");

    return {
      contentHtml,
      title: data.title,
    };
  },
});

function RouteComponent() {
  const { contentHtml, title } = Route.useLoaderData();

  const navigate = Route.useNavigate();
  const t = useTranslations("Front");
  return (
    <MarkdownWithTOC
      title={title}
      markdownResult={contentHtml}
      afterContent={
        <div className="mt-5 flex justify-center">
          <Button
            variant={"action"}
            size={"lg"}
            onClick={() => {
              navigate({ to: "./researches" });
            }}
          >
            {t("data-usage-button")}
          </Button>
        </div>
      }
    />
  );
}
