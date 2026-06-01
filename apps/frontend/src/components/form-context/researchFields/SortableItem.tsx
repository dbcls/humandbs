import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Trash2 } from "lucide-react";

import { ModifiedTag } from "@/components/form-context/fields/ModifiedTag";
import { Button } from "@/components/ui/button";

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
    <div ref={setNodeRef} style={style} className="rounded border border-form-border bg-white">
      <div className="flex items-center gap-2 border-form-muted border-b bg-form-tag-bg px-3 py-2">
        <button
          type="button"
          className="in-disabled:hidden cursor-grab touch-none text-form-icon-btn hover:text-form-icon-btn-hover"
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
          <Button
            variant={"cms-table-action"}
            type="button"
            size={"slim"}
            onClick={onDuplicate}
            className="in-disabled:hidden text-2xs text-form-icon-btn"
          >
            Duplicate <Copy className="size-4" />
          </Button>
        )}
        <Button
          type="button"
          variant={"plain"}
          size="icon"
          onClick={onRemove}
          className="in-disabled:hidden text-form-icon-btn hover:text-danger"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}
