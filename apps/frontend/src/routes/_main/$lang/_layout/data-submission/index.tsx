import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import {
  getDocumentLatestPublishedVersionTranslationQueryOptions,
  getDocumentPublishedVersionsListQueryOptions,
} from "@/serverFunctions/documentVersionTranslation";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useLocale, useTranslations } from "use-intl";

export const Route = createFileRoute("/_main/$lang/_layout/data-submission/")({
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
  const lang = Route.useRouteContext().lang;
  const navigate = Route.useNavigate();
  const t = useTranslations("Data-submission");
  const tCommon = useTranslations("common");

  return (
    <Card caption={title} captionSize={"lg"}>
      <RenderMarkdoc className="mx-auto" content={content} />
      <ul>
        {versions.map((version) => (
          <li key={version.versionNumber}>
            <Link
              to="/$lang/data-submission/version/$version"
              params={{
                lang,
                version: version.versionNumber.toString(),
              }}
            >
              <span>v. {version.versionNumber}</span>
              <span>{version.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="my-5 text-center">
        <Button
          className="text-3xl lowercase first-letter:capitalize"
          size="lg"
          onClick={() => {
            navigate({ to: "./navigation" });
          }}
        >
          {tCommon("to-", { place: t("data-submission") })}
        </Button>
      </div>
    </Card>
  );
}
