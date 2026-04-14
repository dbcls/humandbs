import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { Button } from "./ui/button";
import { ChevronsUpDown } from "lucide-react";
import { useTranslations } from "use-intl";

export function CollapsiblePreview({
  items,
  previewN = 3,
}: {
  previewN?: number;
  items: { id: string | number; content: () => React.ReactNode }[] | undefined;
}) {
  const [open, setOpen] = useState(false);

  const t = useTranslations("common");

  if (!items) return null;

  const previewItems = items.slice(0, previewN);

  const restItems = items.slice(previewN);

  const xMore = items.length - previewN;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {previewItems.map((p) => (
        <div className="my-1" key={p.id}>
          {p.content()}
        </div>
      ))}

      <CollapsibleContent>
        {restItems.map((p) => (
          <div className="my-1" key={p.id}>
            {p.content()}
          </div>
        ))}
      </CollapsibleContent>
      {xMore > 0 ? (
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-foreground-light transition-colors hover:text-neutral-500"
          >
            <ChevronsUpDown className="size-6" />
            <span className="text-xs font-normal">
              {open ? t("collapse") : t("more", { count: xMore })}
            </span>
          </Button>
        </CollapsibleTrigger>
      ) : null}
    </Collapsible>
  );
}
