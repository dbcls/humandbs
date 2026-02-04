import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Card } from "@/components/Card";
import { useAppForm } from "@/components/form-context/FormContext";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DocVersionListItemResponse,
  getDocumentVersionListQueryOptions,
  getDocumentVersionQueryOptions,
} from "@/serverFunctions/documentVersion";

export function DocumentVersion({ contentId }: { contentId: string }) {
  const {
    selectedVersionContent,
    selectedVersionNumber,
    setSelectedVersionNumber,
    versions,
  } = useDocVersions(contentId);

  const form = useAppForm({
    defaultValues: selectedVersionContent,
  });

  return (
    <>
      <Card
        caption={
          <>
            <DocumentVersionSelector
              items={versions}
              versionNumber={selectedVersionNumber}
              onSelect={setSelectedVersionNumber}
            />
          </>
        }
      >
        <>{selectedVersionContent.translations}</>
      </Card>
    </>
  );
}

function useDocVersions(contentId: string) {
  const docVersionsListQO = getDocumentVersionListQueryOptions({ contentId });
  const { data: versions } = useSuspenseQuery(docVersionsListQO);

  const [selectedVersionNumber, setSelectedVersionNumber] = useState<
    number | undefined
  >(versions.at(-1)?.versionNumber);

  const docVersionQO = getDocumentVersionQueryOptions({
    contentId,
    versionNumber: selectedVersionNumber,
  });

  const { data: selectedVersionContent } = useSuspenseQuery(docVersionQO);

  return useMemo(
    () => ({
      selectedVersionNumber,
      setSelectedVersionNumber,
      selectedVersionContent,
      versions,
    }),
    [selectedVersionNumber, selectedVersionContent, versions]
  );
}

interface DocumentVersionSelectorProps {
  items: DocVersionListItemResponse[];
  onSelect: (versionNumber: number) => void;
  versionNumber: number | undefined;
}
/**
 * Document version selector:
 * Dropdown with list of available versions
 */
function DocumentVersionSelector({
  items,
  onSelect,
  versionNumber,
}: DocumentVersionSelectorProps) {
  if (typeof versionNumber !== "number") return null;

  return (
    <Select
      value={`${versionNumber}`}
      onValueChange={(versionNumberStr) => onSelect(Number(versionNumberStr))}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup className="flex flex-col gap-2">
          {items.map((item) => (
            <SelectItem
              key={item.versionNumber}
              value={`${item.versionNumber}`}
            >
              {item.translations.map((tr) => (
                <div key={tr.locale}>
                  {tr.statuses.map((st) => (
                    <div>
                      {st.status}: {st.title}
                    </div>
                  ))}
                </div>
              ))}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
