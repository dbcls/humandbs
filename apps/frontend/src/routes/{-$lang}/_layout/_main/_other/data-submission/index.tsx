import { createFileRoute } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import { Card } from "@/components/Card";
import { PreviousVersionsList } from "@/components/PreviousVersionsList";
import { Button } from "@/components/ui/button";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import {
  getDocumentLatestPublishedVersionTranslationQueryOptions,
  getDocumentPublishedVersionsListQueryOptions,
} from "@/serverFunctions/documentVersionTranslation";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-submission/"
)({
  component: RouteComponent,
  loader: async ({ context }) => {
    const { content, title } = await context.queryClient.ensureQueryData(
      getDocumentLatestPublishedVersionTranslationQueryOptions({
        contentId: "data-submission",
        locale: context.lang,
      })
    );

    const versions = await context.queryClient.ensureQueryData(
      getDocumentPublishedVersionsListQueryOptions({
        contentId: "data-submission",
        locale: context.lang,
      })
    );

    return { content, title, versions };
  },
});

function RouteComponent() {
  const { content, title, versions } = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const t = useTranslations("Navbar");
  const tCommon = useTranslations("common");

  return (
    <Card caption={title} captionSize={"lg"}>
      <RenderMarkdoc className="mx-auto" content={content} />
      <PreviousVersionsList
        documentName={t("data-submission")}
        slug="/{-$lang}/data-submission"
        versions={versions}
      />

      <div className="mx-auto my-5 flex justify-center">
        <Button
          className="text-3xl"
          size="lg"
          onClick={() => {
            navigate({ to: "./navigation" });
          }}
        >
          {tCommon("to-", { place: t("data-submission").toLowerCase() })}
        </Button>
      </div>
    </Card>
  );
}
