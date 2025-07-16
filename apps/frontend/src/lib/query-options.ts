import { queryOptions } from "@tanstack/react-query";
import { ContentId } from "./content-config";
import { Locale } from "./i18n-config";
import { getContent } from "@/serverFunctions/getContent";
import { $getDocuments } from "@/serverFunctions/document";
import { $getDocumentVersions } from "@/serverFunctions/documentVersion";
import { $getDocumentVersionTranslation } from "@/serverFunctions/documentVersionTranslation";

interface ContentQueryOptions {
  contentId: ContentId;
  lang: Locale;
}

export const getContentQueryOptions = ({
  lang,
  contentId,
}: ContentQueryOptions) =>
  queryOptions({
    queryKey: ["content", contentId, lang],
    queryFn: () => getContent({ data: { contentId, lang } }),
  });

export const createGetDocumentListQueryOptions = () =>
  queryOptions({
    queryKey: ["documents"],
    queryFn: () => $getDocuments(),
    staleTime: 5 * 1000 * 60,
  });

export const createGetDocVerTranslationsQueryOptions = ({
  versionId,
  locale,
}: {
  versionId: string | null;
  locale: Locale;
}) =>
  queryOptions({
    queryKey: ["documents", "versions", versionId, locale],
    queryFn: () => {
      if (!versionId || !locale) return Promise.resolve(null);
      return $getDocumentVersionTranslation({
        data: { documentVersionId: versionId, locale },
      });
    },
  });
