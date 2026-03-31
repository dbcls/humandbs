import type { NavbarItem, NavPriority } from "@/config/site-navigation";

const PRIORITY_RANK: Record<NavPriority, number> = {
  important: 0,
  medium: 1,
  optional: 2,
};

export function getNavbarOverflowDropOrder(
  items: Array<Pick<NavbarItem, "priority">>,
): number[] {
  return items
    .map((item, index) => ({
      index,
      priorityRank: PRIORITY_RANK[item.priority],
    }))
    .sort((left, right) => {
      if (left.priorityRank !== right.priorityRank) {
        return right.priorityRank - left.priorityRank;
      }

      return right.index - left.index;
    })
    .map((item) => item.index);
}

export function getNavbarOverflowLayout({
  items,
  itemWidths,
  containerWidth,
  overflowTriggerWidth,
  gap = 0,
}: {
  items: Array<Pick<NavbarItem, "priority">>;
  itemWidths: number[];
  containerWidth: number;
  overflowTriggerWidth: number;
  gap?: number;
}): {
  visibleIndices: number[];
  overflowIndices: number[];
} {
  const allIndices = items.map((_, index) => index);

  if (
    items.length === 0 ||
    itemWidths.length !== items.length ||
    itemWidths.some((width) => width <= 0) ||
    containerWidth <= 0
  ) {
    return {
      visibleIndices: allIndices,
      overflowIndices: [],
    };
  }

  const totalWidthWithoutOverflow = getItemsWidth(allIndices, itemWidths, gap);
  if (totalWidthWithoutOverflow <= containerWidth) {
    return {
      visibleIndices: allIndices,
      overflowIndices: [],
    };
  }

  const shown = new Set(allIndices);
  for (const index of getNavbarOverflowDropOrder(items)) {
    if (fitsWithOverflow(shown, itemWidths, containerWidth, overflowTriggerWidth, gap)) {
      break;
    }

    shown.delete(index);
  }

  const visibleIndices = allIndices.filter((index) => shown.has(index));
  const overflowIndices = allIndices.filter((index) => !shown.has(index));

  return {
    visibleIndices,
    overflowIndices,
  };
}

function fitsWithOverflow(
  shown: Set<number>,
  itemWidths: number[],
  containerWidth: number,
  overflowTriggerWidth: number,
  gap: number,
) {
  const visibleIndices = itemWidths
    .map((_, index) => index)
    .filter((index) => shown.has(index));

  const visibleWidth = getItemsWidth(visibleIndices, itemWidths, gap);
  const overflowWidth =
    overflowTriggerWidth + (visibleIndices.length > 0 ? gap : 0);

  return visibleWidth + overflowWidth <= containerWidth;
}

function getItemsWidth(indices: number[], itemWidths: number[], gap: number) {
  if (indices.length === 0) {
    return 0;
  }

  const itemsWidth = indices.reduce((total, index) => total + itemWidths[index]!, 0);
  return itemsWidth + gap * (indices.length - 1);
}
