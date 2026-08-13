import { describe, expect, test } from "bun:test";

import { normalizeDoiUrl } from "./doi";

describe("normalizeDoiUrl", () => {
  test("turns a bare DOI into its resolver URL", () => {
    expect(normalizeDoiUrl("10.1073/pnas.2427133122")).toBe(
      "https://doi.org/10.1073/pnas.2427133122",
    );
  });

  test("preserves an existing URL", () => {
    expect(normalizeDoiUrl("https://doi.org/10.1073/pnas.2427133122")).toBe(
      "https://doi.org/10.1073/pnas.2427133122",
    );
  });
});
