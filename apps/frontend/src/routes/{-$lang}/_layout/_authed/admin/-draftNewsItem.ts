import type { NewsItemResponse } from "@/serverFunctions/news";

export const DRAFT_NEWS_ID = "draft-news-item" as const;

export function createDraftNewsItem(author: {
  name: string | null;
  email: string;
}): NewsItemResponse {
  return {
    id: DRAFT_NEWS_ID,
    createdAt: new Date(),
    publishedAt: null,
    author,
    alert: null,
    translations: {},
    tags: [],
  };
}

export function isDraftNewsItem(id: string): boolean {
  return id === DRAFT_NEWS_ID;
}
