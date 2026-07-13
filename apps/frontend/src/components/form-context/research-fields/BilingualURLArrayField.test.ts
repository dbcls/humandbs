import { describe, expect, test } from "bun:test";

import { getBilingualUrlRowCount } from "./bilingualUrlRows";

describe("getBilingualUrlRowCount", () => {
  test("renders a row for a Japanese-only URL", () => {
    expect(
      getBilingualUrlRowCount({
        en: [],
        ja: [
          {
            text: "https://www.obgy.med.keio.ac.jp/index.php",
            url: "https://www.obgy.med.keio.ac.jp/index.php",
          },
        ],
      }),
    ).toBe(1);
  });
});
