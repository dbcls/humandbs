/**
 * Renders a shared "En / Ja" column header row above a group of
 * consecutive bilingual fields. Place it once at the top of any
 * section that contains two or more bilingual inputs side-by-side.
 */
export function BilingualColumnHeader() {
  return (
    <div className="flex gap-2 text-xs font-medium uppercase text-gray-400">
      <span className="flex-1">En</span>
      <span className="flex-1">Ja</span>
    </div>
  );
}
