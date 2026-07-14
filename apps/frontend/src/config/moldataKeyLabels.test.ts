import { describe, expect, test } from "bun:test";

import { getMoldataKeyLabel } from "./moldataKeyLabels";

describe("getMoldataKeyLabel", () => {
  test("returns English and Japanese labels for a predefined moldata key", () => {
    expect(getMoldataKeyLabel("Materials and Participants")).toEqual({
      en: "Materials and Participants",
      ja: "材料と対象者",
    });
  });

  test("returns null for a custom moldata key", () => {
    expect(getMoldataKeyLabel("Custom key")).toBeNull();
  });
});
