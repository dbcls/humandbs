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
import type { ResearchVersionDoc } from "@humandbs/backend/types";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { Locale } from "@/config/i18n";
import { NewVersionDialog } from "./-NewVersionDialog";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/StatusTag";

interface ResearchSelectorItemProps {
  compact?: boolean;
  item: {
    v: ResearchVersionDoc;
    draftVersion: string | null;
    latestVersion: string | null;
  };
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
    getResearchVersionsQueryOptions({ humId, lang, includeRawHtml: false }),
  );
  const versions = data.data;

  const selectedItem = versions.find((v) => v.version === selectedVersion);

  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Select value={selectedVersion} onValueChange={onVersionChange}>
        <SelectTrigger className="h-7 w-40 text-xs">
          <SelectValue>
            {selectedItem && (
              <ResearchSelectorItem
                item={{ v: selectedItem, draftVersion, latestVersion }}
                compact
              />
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {versions.map((v) => (
            <SelectItem
              key={v.version}
              value={v.version}
              className="group focus:bg-secondary-light text-xs"
            >
              <ResearchSelectorItem item={{ v, draftVersion, latestVersion }} />
            </SelectItem>
          ))}
          {canNewVersion && (
            <>
              <SelectSeparator />

              <Button
                className="w-full"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setDialogOpen(true)}
              >
                + Add new version
              </Button>
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

function ResearchSelectorItem({ item, compact }: ResearchSelectorItemProps) {
  const isDraft = item.v.version === item.draftVersion;

  return (
    <div className="text-left text-xs group-focus:text-white inline-flex gap-2">
      {item.v.version}
      {!compact && (
        <div className="text-foreground-light group-focus:text-white">
          {item.v.versionReleaseDate}
        </div>
      )}
      {isDraft && <Tag tag="draft" />}
    </div>
  );
}
