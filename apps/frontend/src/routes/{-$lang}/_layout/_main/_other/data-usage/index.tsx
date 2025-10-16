import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getDocumentLatestPublishedVersionTranslationQueryOptions } from "@/serverFunctions/documentVersionTranslation";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/data-usage/")({
  component: RouteComponent,
  loader: async ({ context }) => {
    const { content, title } = await context.queryClient.ensureQueryData(
      getDocumentLatestPublishedVersionTranslationQueryOptions({
        contentId: "data-usage",
        locale: context.lang,
      })
    );

    return { content, title };
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
