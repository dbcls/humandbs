/**
 * Site-content HTML, put into the page.
 *
 * The string is HTML, so this is the one place that sets inner HTML — and the
 * one place that has to justify it. `renderMarkdown` is not given
 * `allowDangerousHtml`, so an HTML node never enters the tree it serialises: a
 * `<script>` written into a document body reaches the serialiser as text and
 * leaves it escaped, and a `javascript:` destination has already lost the
 * attribute that would make it a link (`app/public/markdown.server.ts`). The
 * set of elements that can appear here is therefore the set markdown can
 * express, which is what the renderer's tests hold it to.
 *
 * Research prose does not come through here. It is a tree the page renders
 * directly, with no HTML string anywhere in the path.
 */
export function Markdown({ html, className = "" }: { html: string, className?: string }) {
  return <div className={`markdown ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}
