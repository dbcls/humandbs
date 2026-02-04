import { createFileRoute } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import { Card } from "@/components/Card";
import { PreviousVersionsList } from "@/components/PreviousVersionsList";
import { transformMarkdoc } from "@/markdoc/config";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import {
  $getLatestPublishedDocumentVersion,
  getDocumentPublishedVersionsListQueryOptions,
} from "@/serverFunctions/documentVersion";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/guidelines/"
)({
  component: RouteComponent,
  loader: async ({ context }) => {
    const data = await $getLatestPublishedDocumentVersion({
      data: {
        contentId: "guidelines",
        locale: context.lang,
      },
    });

    const versions = await context.queryClient.ensureQueryData(
      getDocumentPublishedVersionsListQueryOptions({
        contentId: "guidelines",
        locale: context.lang,
      })
    );

    const { content } = transformMarkdoc({ rawContent: data.content ?? "" });

    return { content: JSON.stringify(content), versions };
  },
});

function RouteComponent() {
  const { content, versions } = Route.useLoaderData();

  const t = useTranslations("Navbar");
  return (
    <Card caption={content?.title} captionSize={"lg"}>
      <RenderMarkdoc className="mx-auto" content={content} />
      <PreviousVersionsList
        versions={versions}
        slug="/{-$lang}/guidelines"
        documentName={t("guidelines")}
      />
    </Card>
  );
}
