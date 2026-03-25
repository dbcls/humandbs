import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";

export function SortableItem({
  id,
  index,
  title,
  onRemove,
  disabled,
  children,
}: {
  id: string;
  index: number;
  title: string;
  onRemove: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded border bg-white shadow-sm"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        {!disabled && (
        <button
          type="button"
          className="cursor-grab touch-none text-gray-400 hover:text-gray-600"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        )}
        <span className="flex-1 text-sm font-medium">
          #{index + 1} {title}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-gray-400 hover:text-red-500"
        >
          ✕
        </button>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}
