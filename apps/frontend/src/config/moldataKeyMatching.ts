export function shouldOfferCustomMoldataKey(
  inputValue: string,
  usedKeys: ReadonlySet<string>,
  existingKeys: readonly string[],
): boolean {
  const customKey = inputValue.trim();
  const normalizedCustomKey = customKey.toLowerCase();
  const hasExactMatch = [...usedKeys, ...existingKeys].some(
    (key) => key.toLowerCase() === normalizedCustomKey,
  );

  return customKey.length > 0 && !hasExactMatch;
}
