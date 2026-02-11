import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LucidePlus } from "lucide-react";

export function AddNewButton({
  onClick,
  children,
  className,
}: {
  onClick?: () => void;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Button
      variant={"accent"}
      className={cn("w-full", className)}
      onClick={onClick}
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
