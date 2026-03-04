import { Trash2Icon } from "lucide-react";

import { Button } from "./ui/button";

export function TrashButton({
  onClick,
}: {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <Button variant={"ghost"} size={"slim"} onClick={onClick}>
      <Trash2Icon className="text-danger size-5 transition-colors group-data-[active=true]:text-white" />
    </Button>
  );
}
