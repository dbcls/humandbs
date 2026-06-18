import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useLocale, useTranslations } from "use-intl";

import type { DocPublishedVersionListItemResponse } from "@/repositories/documentVersion";
import { getTwoDocumentVersionsQueryOptions } from "@/serverFunctions/documentVersion";
import { revisionLabel, revisionSplatPath } from "@/utils/revision";

import { DiffViewer } from "./DiffViewer";
import { SkeletonLoading } from "./Skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";

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
        {versions.map((version, i) => (
          <li className="flex gap-2" key={version.versionNumber}>
            <span>{revisionLabel(version.versionNumber, tCommon)}</span>
            <Link
              to="/{-$lang}/$"
              params={{
                lang,
                _splat: revisionSplatPath(revisionsBasePath, version.versionNumber),
              }}
              className="text-secondary"
            >
              <span>{version.title}</span>
            </Link>
            <span>{new Date(version.createdAt).toLocaleDateString(lang)}</span>
            {i < versions.length - 1 ? (
              <DiffModal contentId={version.contentId} versionNumber={version.versionNumber} />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DiffModal({ contentId, versionNumber }: { contentId: string; versionNumber: number }) {
  return (
    <Dialog>
      <DialogTrigger>Open</DialogTrigger>
      <DialogContent className="flex max-h-[90vh] max-w-[90vw] flex-col items-stretch">
        <DialogHeader>
          <DialogTitle>Diff</DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete your account and remove your
            data from our servers.
          </DialogDescription>
        </DialogHeader>
        <DiffModalContent contentId={contentId} versionNumber={versionNumber} />
      </DialogContent>
    </Dialog>
  );
}

function DiffModalContent({
  contentId,
  versionNumber,
}: {
  contentId: string;
  versionNumber: number;
}) {
  const locale = useLocale();

  const documentsDiffQO = getTwoDocumentVersionsQueryOptions({
    contentId,
    versionNumber1: versionNumber - 1,
    versionNumber2: versionNumber,
    locale,
  });

  const { data } = useQuery(documentsDiffQO);

  if (!data) return <SkeletonLoading />;

  return (
    <div className="max-h-full w-full overflow-auto">
      <DiffViewer oldText={data[0]!.content || ""} newText={data[1]!.content || ""} />
    </div>
  );
}
