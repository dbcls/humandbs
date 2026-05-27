import type { MergeFieldDescriptor } from "../-computeMergeFields";

export function MergeSummary({ overwritten }: { overwritten: MergeFieldDescriptor[] }) {
  if (overwritten.length === 0) {
    return <span className="text-gray-400 text-xs">No fields will be changed yet.</span>;
  }

  return (
    <div className="flex min-w-0 items-baseline gap-1.5 text-xs">
      <span className="shrink-0 text-gray-500">Will overwrite:</span>
      <span className="truncate text-gray-700">{overwritten.map((f) => f.label).join(", ")}</span>
      <span className="shrink-0 text-gray-400">({overwritten.length})</span>
    </div>
  );
}
