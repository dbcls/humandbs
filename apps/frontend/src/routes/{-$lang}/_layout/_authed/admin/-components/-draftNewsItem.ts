import {
  getNewsItemQueryOptions,
  type NewsItemResponse,
} from "@/serverFunctions/news";
import { toDateString } from "@/utils/dates";

export const DRAFT_NEWS_ID = "draft-news-item" as const;

export function createDraftNewsItem(author: {
  name: string | null;
  email: string;
}): NewsItemResponse {
  return {
    id: DRAFT_NEWS_ID,
    createdAt: new Date(),
    publishedAt: toDateString(new Date()) || "",
    author,
    alert: null,
    translations: {},
    tags: [],
  };
}

export const draftNewsItemQO = getNewsItemQueryOptions(DRAFT_NEWS_ID);

export function isDraftNewsItem(id: string): boolean {
  return id === DRAFT_NEWS_ID;
}
