import { Code2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * On-demand viewer for a field's legacy `rawHtml`. Read-only, selectable, and
 * copyable so an admin can lift pieces while rewriting the field into Markdown.
 *
 * The trigger renders nothing when there is no legacy value (e.g. API-created
 * records where `rawHtml` is null), so unconverted/legacy-less fields show no
 * affordance. Legacy `rawHtml` is never edited or submitted — this is display only.
 */
export function LegacyHtmlDialog({
  rawHtml,
  label = "View original HTML",
  fieldLabel,
}: {
  rawHtml: string | undefined;
  label?: string;
  fieldLabel?: string;
}) {
  if (!rawHtml) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="slim" className="gap-1">
          <Code2 className="size-3.5" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Original HTML{fieldLabel ? ` — ${fieldLabel}` : ""}</DialogTitle>
          <DialogDescription>
            Legacy reference, read-only. Copy pieces from here while rewriting this field as
            Markdown. This content is never saved.
          </DialogDescription>
        </DialogHeader>
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
          <code>{rawHtml}</code>
        </pre>
      </DialogContent>
    </Dialog>
  );
}
