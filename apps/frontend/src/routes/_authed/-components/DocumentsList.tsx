import { ListItem } from "@/components/ListItem";
import { getDocumentsQueryOptions } from "@/serverFunctions/document";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslations } from "use-intl";

export function DocumentsList({
  onSelectDoc,
  selectedDocId,
}: {
  onSelectDoc: (id: string) => void;
  selectedDocId: string | undefined;
}) {
  const { data: documents } = useSuspenseQuery(getDocumentsQueryOptions());

  const t = useTranslations("Navbar");

  return (
    <ul>
      {documents.map((doc) => {
        const isActive = doc.id === selectedDocId;
        return (
          <ListItem
            key={doc.id}
            role="menuitem"
            onClick={() => onSelectDoc(doc.id)}
            isActive={isActive}
          >
            {t(doc.contentId as any)}
          </ListItem>
        );
      })}
    </ul>
  );
}
