import { arrayMove } from "@dnd-kit/sortable";

import { useEffect, useRef, useState } from "react";

function appendGeneratedIds(
  ids: string[],
  count: number,
  prefix: string,
  nextIdRef: React.MutableRefObject<number>,
) {
  if (count <= 0) {
    return ids;
  }

  return [...ids, ...Array.from({ length: count }, () => `${prefix}-${nextIdRef.current++}`)];
}

export function useStableSortableIds(itemCount: number, prefix: string) {
  const nextIdRef = useRef(0);
  const [itemIds, setItemIds] = useState<string[]>(() =>
    appendGeneratedIds([], itemCount, prefix, nextIdRef),
  );

  useEffect(() => {
    setItemIds((previousIds) => {
      if (previousIds.length === itemCount) {
        return previousIds;
      }

      if (previousIds.length > itemCount) {
        return previousIds.slice(0, itemCount);
      }

      return appendGeneratedIds(previousIds, itemCount - previousIds.length, prefix, nextIdRef);
    });
  }, [itemCount, prefix]);

  const moveItemId = (oldIndex: number, newIndex: number) => {
    setItemIds((previousIds) => arrayMove(previousIds, oldIndex, newIndex));
  };

  const removeItemId = (index: number) => {
    setItemIds((previousIds) => previousIds.filter((_, i) => i !== index));
  };

  const insertItemId = (index: number) => {
    setItemIds((previousIds) => {
      const newId = `${prefix}-${nextIdRef.current++}`;
      const next = [...previousIds];
      next.splice(index, 0, newId);
      return next;
    });
  };

  return { itemIds, moveItemId, removeItemId, insertItemId };
}
