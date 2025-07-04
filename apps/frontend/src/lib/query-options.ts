import { queryOptions } from "@tanstack/react-query";
import { ContentId } from "./content-config";
import { Locale } from "./i18n-config";
import { getContent } from "@/serverFunctions/getContent";

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
