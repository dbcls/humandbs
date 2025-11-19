import { CardWithCaption } from "@/components/Card";
import { CardCaption } from "@/components/CardCaption";
import { ContentHeader } from "@/components/ContentHeader";
import { KeyValueCard, ListOfKeyValues } from "@/components/KeyValueCard";
import { Dataset } from "@humandbs/backend/types";
import { Separator } from "@radix-ui/react-select";
import { getRouteApi } from "@tanstack/react-router";
import ArrowIcon from "@/assets/icons/arrow.svg?react";

export function DatasetVersionCard({ versionData }: { versionData: Dataset }) {
  const Route = getRouteApi(
    "/{-$lang}/_layout/_main/_other/data-usage/datasets/$datasetId"
  );

  const infoKeyValues = {
    "Release date": versionData.releaseDate,
    "Type of data": versionData.typeOfData,
    Criteria: versionData.criteria,
  };

  return (
    <CardWithCaption
      size={"lg"}
      variant={"light"}
      caption={
        <CardCaption
          title="NBDC Dataset ID:"
          icon="dataset"
          badge={"リリース情報"}
          right={
            <Route.Link className="link-button" to="versions">
              <span>All versions</span>
              <ArrowIcon />
            </Route.Link>
          }
        >
          {versionData.datasetId}.{versionData.version}
        </CardCaption>
      }
    >
      <section>
        <ContentHeader>Info</ContentHeader>
        <ListOfKeyValues keyValues={infoKeyValues} />
      </section>

      <section>
        <ContentHeader>Experiments</ContentHeader>
        <ul className="space-y-5">
          {versionData.experiments.map((ex, i) => (
            <li key={i}>
              <ContentHeader variant={"block"}>{ex.header}</ContentHeader>
              <ListOfKeyValues keyValues={ex.data} />

              {ex.footers.length > 0 && (
                <>
                  <Separator />
                  {ex.footers.map((footer, i) => (
                    <p key={i}>{footer}</p>
                  ))}
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    </CardWithCaption>
  );
}
