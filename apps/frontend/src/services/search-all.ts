type PaginatedResponse<T> = {
  data: T[];
  meta: {
    pagination: {
      totalPages: number;
    };
  };
};

export const SEARCH_ALL_PAGE_LIMIT = 100;
const SEARCH_ALL_CONCURRENCY = 5;

export function createAllSearchPage<T extends object>(conditions: T, page: number) {
  return { ...conditions, page, limit: SEARCH_ALL_PAGE_LIMIT, includeFacets: false };
}

/** Fetches the first page, then the remaining pages in bounded parallel batches. */
export async function collectAllPages<T>(
  fetchPage: (page: number) => Promise<PaginatedResponse<T>>,
): Promise<T[]> {
  const firstPage = await fetchPage(1);
  const data = [...firstPage.data];
  const remainingPages = Array.from(
    { length: Math.max(0, firstPage.meta.pagination.totalPages - 1) },
    (_, index) => index + 2,
  );

  for (let index = 0; index < remainingPages.length; index += SEARCH_ALL_CONCURRENCY) {
    const responses = await Promise.all(
      remainingPages.slice(index, index + SEARCH_ALL_CONCURRENCY).map(fetchPage),
    );

    for (const response of responses) data.push(...response.data);
  }

  return data;
}
