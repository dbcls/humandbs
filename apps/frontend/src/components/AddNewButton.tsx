import { LucidePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 *  "+ Add new" button for CMS list of items (middle column)
 */
export function AddNewButton({
  onClick,
  children,
  className,
  disabled,
}: {
  onClick?: () => void;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Button
      variant={"accent"}
      className={cn("w-full", className)}
      onClick={onClick}
      disabled={disabled}
    >
      {children ?? (
        <>
          <LucidePlus className="size-5" />
          <span className="ml-2">Add new</span>
        </>
      )}
    </Button>
  );
}
