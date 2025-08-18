import { Card } from "@/components/Card";
import { PreviousVersionsList } from "@/components/PreviousVersionsList";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { getDocumentVersionsListQueryOptions } from "@/serverFunctions/documentVersion";
import {
  getDocumentLatestPublishedVersionTranslationQueryOptions,
  getDocumentPublishedVersionsListQueryOptions,
} from "@/serverFunctions/documentVersionTranslation";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

export const Route = createFileRoute("/_main/$lang/_layout/guidelines/")({
  component: RouteComponent,
  loader: async ({ context }) => {
    const data = await context.queryClient.ensureQueryData(
      getDocumentLatestPublishedVersionTranslationQueryOptions({
        contentId: "guidelines",
        locale: context.lang,
      })
    );

    const versions = await context.queryClient.ensureQueryData(
      getDocumentPublishedVersionsListQueryOptions({
        contentId: "guidelines",
        locale: context.lang,
      })
    );

    return { data, versions };
  },
});

function RouteComponent() {
  const {
    data: { content, title },
    versions,
  } = Route.useLoaderData();

  const t = useTranslations("Navbar");
  return (
    <Card caption={title} captionSize={"lg"}>
      <RenderMarkdoc className="mx-auto" content={content} />
      <PreviousVersionsList
        versions={versions}
        slug="/$lang/guidelines"
        documentName={t("guidelines")}
      />
    </Card>
  );
}
