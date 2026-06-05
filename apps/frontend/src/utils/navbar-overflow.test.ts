import { describe, expect, test } from "bun:test";

import { getNavbarOverflowDropOrder, getNavbarOverflowLayout } from "./navbar-overflow";

const GAP = 32;

describe("getNavbarOverflowDropOrder", () => {
  test("hides optional before medium before important", () => {
    expect(
      getNavbarOverflowDropOrder([
        { priority: "important" },
        { priority: "optional" },
        { priority: "medium" },
      ]),
    ).toEqual([1, 2, 0]);
  });

  test("hides rightmost items first within the same priority", () => {
    expect(
      getNavbarOverflowDropOrder([
        { priority: "medium" },
        { priority: "medium" },
        { priority: "medium" },
      ]),
    ).toEqual([2, 1, 0]);
  });
});

describe("getNavbarOverflowLayout", () => {
  test("keeps all items visible when they fit", () => {
    expect(
      getNavbarOverflowLayout({
        items: [{ priority: "important" }, { priority: "medium" }, { priority: "optional" }],
        itemWidths: [80, 90, 100],
        containerWidth: 80 + 90 + 100 + GAP * 2,
        overflowTriggerWidth: 48,
        gap: GAP,
      }),
    ).toEqual({
      visibleIndices: [0, 1, 2],
      overflowIndices: [],
    });
  });

  test("moves the lowest-priority item into overflow first", () => {
    expect(
      getNavbarOverflowLayout({
        items: [{ priority: "important" }, { priority: "medium" }, { priority: "optional" }],
        itemWidths: [80, 90, 100],
        containerWidth: 80 + 90 + GAP + 48 + GAP,
        overflowTriggerWidth: 48,
        gap: GAP,
      }),
    ).toEqual({
      visibleIndices: [0, 1],
      overflowIndices: [2],
    });
  });

  test("uses rightmost tie-breaking within a shared priority", () => {
    expect(
      getNavbarOverflowLayout({
        items: [{ priority: "medium" }, { priority: "medium" }, { priority: "medium" }],
        itemWidths: [80, 90, 100],
        containerWidth: 80 + 90 + GAP + 48 + GAP,
        overflowTriggerWidth: 48,
        gap: GAP,
      }),
    ).toEqual({
      visibleIndices: [0, 1],
      overflowIndices: [2],
    });
  });

  test("continues hiding through higher-priority items when necessary", () => {
    expect(
      getNavbarOverflowLayout({
        items: [{ priority: "important" }, { priority: "medium" }, { priority: "optional" }],
        itemWidths: [100, 100, 100],
        containerWidth: 100 + 48 + GAP,
        overflowTriggerWidth: 48,
        gap: GAP,
      }),
    ).toEqual({
      visibleIndices: [0],
      overflowIndices: [1, 2],
    });
  });
});
