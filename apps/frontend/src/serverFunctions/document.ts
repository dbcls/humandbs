import { db } from "@/lib/database";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

/** List all documents */
export const $getDocuments = createServerFn({
  type: "dynamic",
  method: "GET",
  response: "data",
}).handler(async () => {
  const documents = await db.query.document.findMany();

  return documents;
});

export function getDocumentsQueryOptions() {
  return queryOptions({
    queryKey: ["documents"],
    queryFn: $getDocuments,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
