import type { NewsItemRecord } from "@/repositories/newsItem";
import type { NewsItemResponse } from "@/serverFunctions/news";

export const DRAFT_NEWS_ID = "draft-news-item" as const;

export function createDraftNewsItem(author: {
  name: string | null;
  email: string;
}): NewsItemResponse {
  return {
    id: DRAFT_NEWS_ID,
    createdAt: new Date(),
    publishedAt: new Date(),
    author,
    translations: [],
    tags: [],
  };
}

/** Detail-shaped draft for the right-hand form (translations keyed by locale). */
export function createDraftNewsItemDetail(author: {
  name: string | null;
  email: string;
}): NewsItemRecord {
  return {
    id: DRAFT_NEWS_ID,
    createdAt: new Date(),
    publishedAt: new Date(),
    author,
    translations: {},
    tags: [],
  };
}

export function isDraftNewsItem(id: string): boolean {
  return id === DRAFT_NEWS_ID;
}
