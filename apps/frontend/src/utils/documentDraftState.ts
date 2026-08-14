function normalizeDocumentText(value: string | null | undefined): string {
  return value ?? "";
}

/**
 * A title field is unpublished only when a published translation exists and
 * its current draft value differs from that published value. In particular,
 * the last autosaved draft is not a comparison baseline.
 */
export function isDocumentDraftValueUnpublished(
  draftValue: string | null | undefined,
  publishedValue: string | null | undefined,
  hasPublishedVersion: boolean,
): boolean {
  return (
    hasPublishedVersion &&
    normalizeDocumentText(draftValue) !== normalizeDocumentText(publishedValue)
  );
}
