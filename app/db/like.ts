/**
 * A literal to match with `LIKE`, with what `LIKE` would otherwise read as a
 * pattern escaped: typed into a search box, `%` or `_` would match every row.
 * The escape is the backslash, which each query names (`ESCAPE '\'`).
 */
export function likeEscaped(value: string): string {
  return value.replaceAll(/[\\%_]/g, (char) => `\\${char}`)
}
