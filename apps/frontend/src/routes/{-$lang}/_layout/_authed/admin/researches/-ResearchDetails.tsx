import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/config/i18n";
import { getResearchQueryOptions } from "@/serverFunctions/researches";

import { UpdateResearchDialog } from "./-UpdateResearchDialog";

export function ResearchDetails({
  humId,
  lang,
}: {
  humId: string;
  lang: Locale;
}) {
  const { data: response } = useSuspenseQuery(
    getResearchQueryOptions({ humId, lang }),
  );
  const research = response.data;

  const [editingHumId, setEditingHumId] = useState<string | null>(null);

  return (
    <>
      <Card
        className="flex h-full flex-1 flex-col"
        caption={research.humId}
        containerClassName="flex flex-1 flex-col overflow-auto"
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
          <dt className="text-foreground-light font-medium">Title (ja)</dt>
          <dd>{research.title.ja}</dd>

          <dt className="text-foreground-light font-medium">Title (en)</dt>
          <dd>{research.title.en}</dd>

          <dt className="text-foreground-light font-medium">Status</dt>
          <dd className="capitalize">{research.status}</dd>

          <dt className="text-foreground-light font-medium">Version</dt>
          <dd>
            {research.version}{" "}
            <span className="text-foreground-light text-xs">
              ({research.versionReleaseDate})
            </span>
          </dd>

          <dt className="text-foreground-light font-medium">Datasets</dt>
          <dd>
            {research.datasets.length > 0 ? (
              <ul className="flex flex-wrap gap-1">
                {research.datasets.map((ds) => (
                  <li
                    key={ds.datasetId}
                    className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs"
                  >
                    {ds.datasetId}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-foreground-light">None</span>
            )}
          </dd>

          {research.dataProvider.length > 0 && (
            <>
              <dt className="text-foreground-light font-medium">
                Data Providers
              </dt>
              <dd>
                <ul className="list-inside list-disc text-xs">
                  {research.dataProvider.map((p, i) => (
                    <li key={i}>
                      {p.name[lang]?.text ?? p.name.ja?.text ?? p.name.en?.text}
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          )}
        </dl>

        <div className="mt-auto flex gap-2 pt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditingHumId(humId)}
          >
            Edit
          </Button>
        </div>
      </Card>

      <UpdateResearchDialog
        lang={lang}
        humId={editingHumId}
        onClose={() => setEditingHumId(null)}
      />
    </>
  );
}
