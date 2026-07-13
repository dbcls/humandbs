import { describe, expect, test } from "bun:test";

import { compareMoldataKeys } from "./moldataKeyOrder";

describe("compareMoldataKeys", () => {
  test("uses the predefined moldata key order and leaves custom keys after it", () => {
    expect(
      [
        "Data Summary",
        "Custom key A",
        "Targets",
        "Materials and Participants",
        "Custom key B",
      ].sort(compareMoldataKeys),
    ).toEqual([
      "Materials and Participants",
      "Targets",
      "Data Summary",
      "Custom key A",
      "Custom key B",
    ]);
  });
});
