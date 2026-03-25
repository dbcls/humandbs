import { describe, expect, test } from "bun:test";

import { buildAssetMarkdown } from "./content-area-asset-utils";

describe("buildAssetMarkdown", () => {
  test("renders image markdown for image assets", () => {
    expect(
      buildAssetMarkdown({
        type: "file",
        name: "diagram.png",
        path: "faq/diagram.png",
        url: "/files/faq/diagram.png",
        mimeType: "image/png",
        size: 1234,
      }),
    ).toBe("![diagram.png](/files/faq/diagram.png)");
  });

  test("renders link markdown for non-image assets", () => {
    expect(
      buildAssetMarkdown({
        type: "file",
        name: "guide.pdf",
        path: "faq/guide.pdf",
        url: "/files/faq/guide.pdf",
        mimeType: "application/pdf",
        size: 4321,
      }),
    ).toBe("[guide.pdf](/files/faq/guide.pdf)");
  });
});
