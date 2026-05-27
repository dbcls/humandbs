import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Trash2 } from "lucide-react";

import { ModifiedTag } from "@/components/form-context/fields/ModifiedTag";

export function SortableItem({
  id,
  index,
  title,
  isModified,
  onRemove,
  onDuplicate,
  children,
}: {
  id: string;
  index: number;
  title: string;
  isModified?: boolean;
  onRemove: () => void;
  onDuplicate?: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded border border-gray-300 bg-white">
      <div className="flex items-center gap-2 border-gray-400 border-b bg-gray-300 px-3 py-2">
        <button
          type="button"
          className="in-disabled:hidden cursor-grab touch-none text-gray-400 hover:text-gray-600"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="flex-1 font-medium text-sm">
          #{index + 1} {title}
        </span>
        <ModifiedTag isModified={isModified ?? false} />
        {onDuplicate && (
          <button
            type="button"
            onClick={onDuplicate}
            className="in-disabled:hidden text-gray-400 hover:text-gray-600"
          >
            <Copy className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="in-disabled:hidden text-gray-400 hover:text-red-500"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}
