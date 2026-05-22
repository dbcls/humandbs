import { Link } from "@tanstack/react-router";
import { useLocale, useTranslations } from "use-intl";

import type { DocPublishedVersionListItemResponse } from "@/repositories/documentVersion";

export function PreviousVersionsList({
  revisionsBasePath,
  versions,
  documentName,
}: {
  revisionsBasePath: string;
  versions: DocPublishedVersionListItemResponse[];
  documentName?: string | null;
}) {
  const tCommon = useTranslations("common");
  const lang = useLocale();

  const name = documentName ?? versions[0]?.title ?? revisionsBasePath;

  return (
    <div>
      <h2 className="font-bold text-md text-neutral-800">
        {tCommon("previous-versions", { documentName: name })}
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
