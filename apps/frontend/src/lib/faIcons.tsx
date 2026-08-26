export const FA_ICONS = {
  books: <span className="font-black font-fontawesome before:content-(--books)" />,
  dataset: <span className="font-black font-fontawesome before:content-(--dataset)" />,
  info: <span className="font-black font-fontawesome text-secondary before:content-(--info)" />,
  tip: <span className="font-black font-fontawesome text-amber-400 before:content-(--tip)" />,
  warning: (
    <span className="font-black font-fontawesome text-amber-400 before:content-(--warning)" />
  ),
  error: <span className="font-black font-fontawesome text-danger before:content-(--error)" />,
} as const;
