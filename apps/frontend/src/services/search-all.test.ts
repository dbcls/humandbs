import { describe, expect, test } from "bun:test";

import { collectAllPages, createAllSearchPage } from "./search-all";

test("createAllSearchPage uses the maximum page size and disables facets", () => {
  expect(createAllSearchPage({ lang: "ja", order: "asc" }, 2)).toEqual({
    lang: "ja",
    order: "asc",
    page: 2,
    limit: 100,
    includeFacets: false,
  });
});

describe("collectAllPages", () => {
  test("fetches the remaining pages with five concurrent requests and preserves record order", async () => {
    const requestedPages: number[] = [];
    let activeRequests = 0;
    let maxActiveRequests = 0;

    const data = await collectAllPages(async (page) => {
      requestedPages.push(page);
      if (page === 1) {
        return {
          data: [10, 11],
          meta: { pagination: { totalPages: 12 } },
        };
      }

      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await Promise.resolve();
      activeRequests -= 1;

      return {
        data: [page * 10, page * 10 + 1],
        meta: { pagination: { totalPages: 12 } },
      };
    });

    expect(requestedPages).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(maxActiveRequests).toBe(5);
    expect(data).toEqual([
      10, 11, 20, 21, 30, 31, 40, 41, 50, 51, 60, 61, 70, 71, 80, 81, 90, 91, 100, 101, 110, 111,
      120, 121,
    ]);
  });

  test("rejects instead of returning partial data when a later page fails", async () => {
    const requestedPages: number[] = [];
    const failure = new Error("Page request failed");

    await expect(
      collectAllPages(async (page) => {
        requestedPages.push(page);
        if (page === 2) throw failure;
        return {
          data: [page],
          meta: { pagination: { totalPages: 3 } },
        };
      }),
    ).rejects.toThrow(failure);

    expect(requestedPages).toEqual([1, 2, 3]);
  });
});
