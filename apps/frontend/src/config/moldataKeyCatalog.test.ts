import { describe, expect, test } from "bun:test";

import { resolveMoldataKeys } from "./moldataKeyCatalog";

const catalog = {
  revision: 3,
  entries: [
    { id: "first", english: "Targets", japanese: "ターゲット", position: 0 },
    { id: "second", english: "Materials", japanese: "材料", position: 1 },
  ],
};

describe("resolveMoldataKeys", () => {
  test("localizes registered keys and orders them by catalog position", () => {
    const values = { Custom: 1, Materials: 2, Targets: 3 };

    expect(resolveMoldataKeys(values, catalog, "ja")).toEqual([
      { key: "Targets", label: "ターゲット", value: 3 },
      { key: "Materials", label: "材料", value: 2 },
      { key: "Custom", label: "Custom", value: 1 },
    ]);
  });

  test("keeps unknown and deleted keys in source order with raw-key fallback", () => {
    const values = { "Removed key": 1, Another: 2 };

    expect(resolveMoldataKeys(values, catalog, "en")).toEqual([
      { key: "Removed key", label: "Removed key", value: 1 },
      { key: "Another", label: "Another", value: 2 },
    ]);
  });

  test("uses exact raw-key matching", () => {
    expect(resolveMoldataKeys({ targets: 1 }, catalog, "en")).toEqual([
      { key: "targets", label: "targets", value: 1 },
    ]);
  });
});
