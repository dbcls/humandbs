import { ChevronsUpDown } from "lucide-react";
import { useTranslations } from "use-intl";

import { useState } from "react";

import { Button } from "./ui/button";
import { Collapsible, CollapsibleTrigger } from "./ui/collapsible";

export function CollapsiblePreview({
  items,
  previewN = 3,
}: {
  previewN?: number;
  items: { id: string | number; content: React.ReactNode }[] | undefined;
}) {
  const [open, setOpen] = useState(false);

  const t = useTranslations("common");

  if (!items) return null;

  const previewItems = items.slice(0, previewN);

  const restItems = items.slice(previewN);

  const xMore = items.length - previewN;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <ul className="space-y-4">
        {previewItems.map((p) => (
          <li key={p.id}>{p.content}</li>
        ))}
        {open && restItems.map((p) => <li key={p.id}>{p.content}</li>)}
      </ul>

      {xMore > 0 ? (
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-foreground-light transition-colors hover:text-neutral-500"
          >
            <ChevronsUpDown className="size-6" />
            <span className="font-normal text-xs">
              {open ? t("collapse") : t("more", { count: xMore })}
            </span>
          </Button>
        </CollapsibleTrigger>
      ) : null}
    </Collapsible>
  );
}
