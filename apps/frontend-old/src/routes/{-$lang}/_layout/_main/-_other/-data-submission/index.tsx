import { createFileRoute } from "@tanstack/react-router";
import { useTranslations } from "use-intl";

import { Card } from "@/components/Card";
import { PreviousVersionsList } from "@/components/PreviousVersionsList";
import { Button } from "@/components/ui/button";
import { transformMarkdoc } from "@/markdoc/config";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import {
  $getLatestPublishedDocumentVersion,
  $getPublishedDocumentVersionList,
} from "@/serverFunctions/documentVersion";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-submission/"
)({
  component: RouteComponent,
  loader: async ({ context }) => {
    const data = await $getLatestPublishedDocumentVersion({
      data: { contentId: "data-submission", locale: context.lang },
    });

    const versions = await $getPublishedDocumentVersionList({
      data: { contentId: "data-submission", locale: context.lang },
    });

    const { content } = transformMarkdoc({ rawContent: data.content ?? "" });

    return { content: JSON.stringify(content), versions };
  },
});

function RouteComponent() {
  const { content, versions } = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const t = useTranslations("Navbar");
  const tCommon = useTranslations("common");

  return (
    <Card caption={content?.title} captionSize={"lg"}>
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
