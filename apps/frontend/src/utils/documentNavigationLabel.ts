export interface DocumentNavigationLabelSource {
  shortTitle?: string | null;
  title?: string | null;
}

/**
 * Returns the compact label used for document navigation. Whitespace-only
 * short titles deliberately behave like no short title at all.
 */
export function getEffectiveDocumentNavigationLabel({
  shortTitle,
  title,
}: DocumentNavigationLabelSource): string | undefined {
  const compact = shortTitle?.trim();
  if (compact) return compact;

  return title?.trim() || undefined;
}

/** Human-readable label for CMS document lists. */
export function formatDocumentListLabel({
  shortTitle,
  title,
}: DocumentNavigationLabelSource): string {
  const compact = shortTitle?.trim();
  const long = title?.trim() ?? "";

  if (!compact) return long;
  return long ? `${compact} (${long})` : compact;
}
