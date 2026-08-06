/**
 * Turning the markdown a curator wrote into HTML.
 *
 * **Server only.** The result is a string in the loader's payload, so the
 * parser never reaches the browser. Rendering in a component would ship the
 * whole remark stack to every reader for text that never changes after it is
 * published.
 *
 * Raw HTML is parsed rather than escaped, because the article text genuinely
 * contains `<br>` and `<sup>` — they carry meaning that markdown has no syntax
 * for, and the migration puts them into the text on purpose. Everything that
 * comes back out of the sanitiser is on a fixed allowlist, so a `<script>` or
 * an `onclick` written into a value cannot become one: content is edited
 * through the portal, but it also arrives from a migration and from providers,
 * and it renders on the portal's own origin.
 */

import rehypeRaw from "rehype-raw"
import rehypeSanitize from "rehype-sanitize"
import rehypeStringify from "rehype-stringify"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"

const processor = unified()
  .use(remarkParse)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize)
  .use(rehypeStringify)

export function renderMarkdown(source: string): string {
  if (source === "") return ""
  return String(processor.processSync(source))
}
