import { Link } from "@tanstack/react-router";
import { useLocale, useTranslations } from "use-intl";

import type { DocPublishedVersionListItemResponse } from "@/repositories/documentVersion";
import type { FileRoutesByTo } from "@/routeTree.gen";

type LinksWithVersionLists = keyof Pick<
  FileRoutesByTo,
  "/{-$lang}/data-submission" | "/{-$lang}/guidelines"
>;

export function PreviousVersionsList({
  slug,
  versions,
}: {
  slug: LinksWithVersionLists;
  versions: DocPublishedVersionListItemResponse[];
}) {
  const tCommon = useTranslations("common");
  const docId = slug.split("/").at(-1)!;

  const tNav = useTranslations("Navbar");

  const documentName = tNav(docId ?? "");

  const lang = useLocale();

  return (
    <div>
      <h2 className="text-md font-bold text-neutral-800">
        {tCommon("previous-versions", { documentName })}
      </h2>
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
            <span>{new Date(version.createdAt).toLocaleDateString(lang)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
