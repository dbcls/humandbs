import { expect, test } from "bun:test";

import { normalizeAssetFolderPath } from "./assets";

test("allows the asset root as an upload folder", () => {
  expect(normalizeAssetFolderPath("")).toBe("");
});
