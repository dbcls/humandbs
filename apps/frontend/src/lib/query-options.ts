import { $getDocuments } from "@/serverFunctions/document";
import { getContent } from "@/serverFunctions/getContent";
import { queryOptions } from "@tanstack/react-query";
import { ContentId } from "./content-config";
import { Locale } from "./i18n-config";

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
