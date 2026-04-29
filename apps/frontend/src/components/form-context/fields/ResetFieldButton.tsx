import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ResetFieldButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      className={cn(
        "absolute right-0 text-gray-400 hover:text-gray-600",
        className,
      )}
      title="Reset to initial value"
    >
      <RotateCcw className="size-4" />
    </Button>
  );
}
