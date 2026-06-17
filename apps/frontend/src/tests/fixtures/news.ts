import type * as schema from "@/db/schema";

import { AUTHOR_ID_1, AUTHOR_ID_2 } from "./users";

type NewsItem = typeof schema.newsItem.$inferInsert;
type NewsTag = typeof schema.newsTag.$inferInsert;
type NewsTranslation = typeof schema.newsTranslation.$inferInsert;
type NewsItemTag = typeof schema.newsItemTag.$inferInsert;

export const NEWS_1_ID = "223e4567-e89b-12d3-a456-426614174000";
export const NEWS_2_ID = "223e4567-e89b-12d3-a456-426614174001";

export const TAG_1_ID = "323e4567-e89b-12d3-a456-426614174000";
export const TAG_2_ID = "323e4567-e89b-12d3-a456-426614174001";

export const mockNewsTags: NewsTag[] = [
  { id: TAG_1_ID, name: "release", color: "#ff0000" },
  { id: TAG_2_ID, name: "maintenance", color: null },
];

export const mockNewsItems: NewsItem[] = [
  {
    id: NEWS_1_ID,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    publishedAt: new Date("2024-01-02T00:00:00Z"),
    authorId: AUTHOR_ID_1,
  },
  {
    id: NEWS_2_ID,
    createdAt: new Date("2024-02-01T00:00:00Z"),
    publishedAt: null,
    authorId: AUTHOR_ID_2,
  },
];

export const mockNewsTranslations: NewsTranslation[] = [
  {
    newsId: NEWS_1_ID,
    title: "News 1 en",
    lang: "en",
    content: "Content 1 en",
    updatedAt: new Date("2024-01-03T00:00:00Z"),
  },
  {
    newsId: NEWS_1_ID,
    title: "News 1 ja",
    lang: "ja",
    content: "Content 1 ja",
    updatedAt: new Date("2024-01-03T00:00:00Z"),
  },
  {
    newsId: NEWS_2_ID,
    title: "News 2 en",
    lang: "en",
    content: "Content 2 en",
    updatedAt: null,
  },
];

export const mockNewsItemTags: NewsItemTag[] = [
  { newsId: NEWS_1_ID, tagId: TAG_1_ID },
  { newsId: NEWS_1_ID, tagId: TAG_2_ID },
];
