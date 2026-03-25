import { Badge } from "../../ui/badge";

export function ModifiedTag({ isModified }: { isModified: boolean }) {
  if (!isModified) return null;

  return (
    <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400">
      Modified
    </Badge>
  );
}
