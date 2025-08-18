import { FileRoutesByTo } from "@/routeTree.gen";
import { DocumentPublishedVersionsListItemResponse } from "@/serverFunctions/documentVersionTranslation";
import { Link } from "@tanstack/react-router";
import { useLocale, useTranslations } from "use-intl";

type LinksWithVersionLists = keyof Pick<
  FileRoutesByTo,
  "/$lang/data-submission" | "/$lang/guidelines"
>;

export function PreviousVersionsList({
  slug,
  versions,
  documentName,
}: {
  slug: LinksWithVersionLists;
  versions: DocumentPublishedVersionsListItemResponse[];
  documentName: string;
}) {
  const tCommon = useTranslations("common");
  const lang = useLocale();

  return (
    <div className="prose mx-auto mt-5 w-[65ch] text-base">
      <h2>{tCommon("previous-versions", { documentName })}</h2>
      <ul>
        {versions.map((version) => (
          <li className="flex gap-2" key={version.versionNumber}>
            <span>v. {version.versionNumber}</span>
            <Link
              to={`${slug}/revision/$revision`}
              params={{
                lang,
                revision: version.versionNumber.toString(),
              }}
              className="text-secondary"
            >
              <span>{version.title}</span>
            </Link>
            <span>{version.createdAt.toLocaleDateString(lang)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
