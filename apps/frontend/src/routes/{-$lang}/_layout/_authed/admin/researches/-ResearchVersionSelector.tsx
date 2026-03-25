import { useState, Suspense } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getResearchVersionsQueryOptions } from "@/serverFunctions/researches";
import type { ResearchVersion } from "@humandbs/backend/types";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { Locale } from "@/config/i18n";
import { NewVersionDialog } from "./-NewVersionDialog";

function versionLabel(
  v: ResearchVersion,
  draftVersion: string | null,
  latestVersion: string | null,
) {
  const date = v.versionReleaseDate
    ? v.versionReleaseDate.slice(0, 10)
    : "—";
  const suffix =
    v.version === draftVersion
      ? " (draft)"
      : v.version === latestVersion
        ? " (latest)"
        : "";
  return `${v.version} — ${date}${suffix}`;
}

function VersionSelectorInner({
  humId,
  lang,
  selectedVersion,
  draftVersion,
  latestVersion,
  canNewVersion,
  onVersionChange,
}: {
  humId: string;
  lang: Locale;
  selectedVersion: string;
  draftVersion: string | null;
  latestVersion: string | null;
  canNewVersion: boolean;
  onVersionChange: (version: string) => void;
}) {
  const { data } = useSuspenseQuery(
    getResearchVersionsQueryOptions({ humId, lang }),
  );
  const versions = data.data;
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Select value={selectedVersion} onValueChange={onVersionChange}>
        <SelectTrigger className="h-7 w-40 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {versions.map((v) => (
            <SelectItem key={v.version} value={v.version} className="text-xs">
              {versionLabel(v, draftVersion, latestVersion)}
            </SelectItem>
          ))}
          {canNewVersion && (
            <>
              <SelectSeparator />
              <div className="px-2 py-1">
                <button
                  type="button"
                  className="w-full rounded px-2 py-1.5 text-left text-xs font-medium text-secondary hover:bg-muted"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => setDialogOpen(true)}
                >
                  + Add new version
                </button>
              </div>
            </>
          )}
        </SelectContent>
      </Select>

      {canNewVersion && (
        <NewVersionDialog
          humId={humId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onVersionCreated={onVersionChange}
        />
      )}
    </>
  );
}

export function ResearchVersionSelector(props: {
  humId: string;
  lang: Locale;
  selectedVersion: string;
  draftVersion: string | null;
  latestVersion: string | null;
  canNewVersion: boolean;
  onVersionChange: (version: string) => void;
}) {
  return (
    <Suspense
      fallback={
        <div className="h-7 w-40 animate-pulse rounded bg-muted text-xs" />
      }
    >
      <VersionSelectorInner {...props} />
    </Suspense>
  );
}
