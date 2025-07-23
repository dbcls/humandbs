import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getContent } from "@/serverFunctions/getContent";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

export const Route = createFileRoute("/_main/$lang/_layout/data-submission/")({
  component: RouteComponent,
  loader: async ({ context }) => {
    const { content, frontmatter } = await getContent({
      data: {
        contentId: "data-submission",
        lang: context.lang,
      },
    });
    return {
      content,
      frontmatter,
    };
  },
});

function RouteComponent() {
  const { content, frontmatter } = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const t = useTranslations("Data-submission");

  return (
    <Card caption={frontmatter.title} captionSize={"lg"}>
      <RenderMarkdoc className="mx-auto" content={content} />
      <div className="my-5 text-center">
        <Button
          className="text-3xl"
          size="lg"
          onClick={() => {
            navigate({ to: "./navigation" });
          }}
        >
          {t("data-submission")}
        </Button>
      </div>
    </Card>
  );
}
