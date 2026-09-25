/**
 * The `common/` files a body links to, read out of its text.
 *
 * A body keeps a link as the address a reader opens (`filePath`), so the name
 * in the store is that address with each segment unescaped. The address is read
 * out of the text of the JSON the body is stored as, and it ends where a link or
 * an image written in markdown, in HTML or as a JSON string ends: whitespace, a
 * quote, a bracket, or a backslash, which in that text is the start of an escape
 * such as `\n`. A query or a fragment is not part of the name.
 *
 * A name with `'`, `(` or `)` in it is not read back whole. `encodeURIComponent`
 * leaves those unescaped, and there is no telling one apart from the end of a
 * markdown link.
 */

import { COMMON_PREFIX_NAME, isFileSlug } from "./prefix"

const ADDRESS = new RegExp(String.raw`/files/${COMMON_PREFIX_NAME}/([^\s"'()[\]<>\\?#]*)`, "g")

function unescaped(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

export function commonFileNames(text: string): string[] {
  const names = new Set<string>()
  for (const [, written = ""] of text.matchAll(ADDRESS)) {
    const name = written.split("/").map(unescaped).join("/")
    if (isFileSlug(name)) names.add(name)
  }
  return [...names].sort()
}
