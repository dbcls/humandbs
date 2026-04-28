import { Link } from "@tanstack/react-router";
import { useLocale, useTranslations } from "use-intl";

import type { DocPublishedVersionListItemResponse } from "@/repositories/documentVersion";

export function PreviousVersionsList({
  revisionsBasePath,
  versions,
}: {
  revisionsBasePath: string;
  versions: DocPublishedVersionListItemResponse[];
}) {
  const tCommon = useTranslations("common");
  const tNav = useTranslations("Navbar");
  const lang = useLocale();

  const docId = revisionsBasePath.split("/").at(-1)!;
  const documentName = tNav(docId ?? "");

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
              to="/{-$lang}/$"
              params={{
                lang,
                _splat: `${revisionsBasePath}/revision/${version.versionNumber}`,
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
