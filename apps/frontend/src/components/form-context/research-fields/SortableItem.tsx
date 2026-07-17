import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, Copy, GripVertical, Trash2 } from "lucide-react";

import { useState } from "react";

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
  const [isOpen, setIsOpen] = useState(true);
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
      <div className="flex items-center gap-2 border-form-muted bg-form-sublabel/30 px-3 py-2">
        <button
          type="button"
          className="in-disabled:hidden cursor-grab touch-none text-form-icon-btn hover:text-form-icon-btn-hover"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <button
          type="button"
          aria-expanded={isOpen}
          aria-label={`${isOpen ? "Collapse" : "Expand"} item ${index + 1}`}
          onClick={() => setIsOpen((open) => !open)}
          className="text-form-icon-btn hover:text-form-icon-btn-hover"
        >
          {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
          className="flex-1 cursor-pointer text-left font-medium text-sm"
        >
          #{index + 1} {title}
        </button>
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
      {isOpen && <div className="p-3">{children}</div>}
    </div>
  );
}
