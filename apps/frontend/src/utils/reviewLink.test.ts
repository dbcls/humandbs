import { describe, expect, test } from "bun:test";

import { buildReviewLink } from "./reviewLink";

describe("buildReviewLink", () => {
  test("uses the system URL origin and preserves the encoded detail redirect", () => {
    expect(buildReviewLink("http://localhost:8080", "hum1234")).toBe(
      "http://localhost:8080/auth/login?redirect=%2Fresearch%2Fhum1234",
    );
  });

  test("builds the requested research-list redirect", () => {
    expect(buildReviewLink("https://humandbs-staging.ddbj.nig.ac.jp/api", "hum1234", "list")).toBe(
      "https://humandbs-staging.ddbj.nig.ac.jp/auth/login?redirect=%2Fresearch%3Fquery%3Dhum1234",
    );
  });

  test("builds the requested releases redirect", () => {
    expect(
      buildReviewLink("https://humandbs-staging.ddbj.nig.ac.jp/api", "hum1234", "releases"),
    ).toBe(
      "https://humandbs-staging.ddbj.nig.ac.jp/auth/login?redirect=%2Fresearch%2Fhum1234%2Fversions",
    );
  });
});
