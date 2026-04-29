import { Badge } from "../../ui/badge";

export function ModifiedTag({ isModified }: { isModified: boolean }) {
  if (!isModified) return null;

  return (
    <Badge className="border-amber-700 bg-amber-100 py-0 text-xs text-amber-950">
      Modified
    </Badge>
  );
}
