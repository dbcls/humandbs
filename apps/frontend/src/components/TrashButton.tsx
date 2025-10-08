import { Trash2Icon } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

export function TrashButton({
  onClick,
  isActive,
}: {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  isActive?: boolean;
}) {
  return (
    <Button variant={"ghost"} size={"slim"} onClick={onClick}>
      <Trash2Icon
        className={cn("text-danger size-5 transition-colors", {
          "text-white": isActive,
        })}
      />
    </Button>
  );
}
