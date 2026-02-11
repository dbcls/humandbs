import { createFileRoute } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { transformMarkdoc } from "@/markdoc/config";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { $getLatestPublishedDocumentVersion } from "@/serverFunctions/documentVersion";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-usage/"
)({
  component: RouteComponent,
  loader: async ({ context }) => {
    const data = await $getLatestPublishedDocumentVersion({
      data: {
        contentId: "data-usage",
        locale: context.lang,
      },
    });

    const { content } = transformMarkdoc({ rawContent: data.content ?? "" });

    return {
      content: JSON.stringify(content),
      title: data.title,
    };
  },
});

function RouteComponent() {
  const { content, title } = Route.useLoaderData();

  const navigate = Route.useNavigate();
  const t = useTranslations("Front");
  return (
    <Card caption={title} captionSize={"lg"}>
      <RenderMarkdoc className="mx-auto" content={content} />
      <div className="flex justify-center">
        <Button
          variant={"action"}
          size={"lg"}
          onClick={() => navigate({ to: "./researches" })}
        >
          {t("data-usage-button")}
        </Button>
      </div>
    </Card>
  );
}
