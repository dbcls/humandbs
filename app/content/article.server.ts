/**
 * What a document or a news item may be written in, checked where it is saved.
 *
 * Site content keeps a wider dialect than research prose does — headings,
 * numbered clauses and tables are the structure of a guideline rather than
 * decoration — so it stays a markdown string and the allowed set is "whatever
 * CommonMark and GFM tables can say" (`docs/data-model.md` の「サイトコンテンツ」).
 *
 * Two things are outside it, and both are refused here rather than dropped at
 * render time:
 *
 * - **raw HTML.** The renderer is never given `allowDangerousHtml`, so an HTML
 *   node cannot reach the page. But refusing it there means *dropping* it — an
 *   inline tag loses its markup and a block loses its text — and the page is
 *   not where an author finds out
 * - **a destination the page will not follow.** `[x](javascript:…)` renders as
 *   its text, which is the same silent loss. The check is the one the research
 *   prose applies to a span's URL (`linkHref`)
 *
 * The parser here is the one the renderer uses, GFM included, so what this
 * accepts is exactly what the page will show.
 */

import type { Nodes } from "mdast"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"

import { linkHref } from "./richtext"

/**
 * What was written that a page cannot hold. The name is the whole of the
 * answer; the wording shown to the author is chosen where the screen is
 * (`messages.ts`), because this module has no language.
 */
export type ArticleSyntax = "html" | "link"

export interface ArticleProblem {
  syntax: ArticleSyntax
  /** 1-based line of the source, so the author can find what was refused. */
  line: number
}

const processor = unified().use(remarkParse).use(remarkGfm)

function lineOf(node: Nodes): number {
  return node.position?.start.line ?? 1
}

/** The destination a node carries, if it carries one. */
function destinationOf(node: Nodes): string | null {
  if (node.type === "link" || node.type === "image" || node.type === "definition") return node.url
  return null
}

function walk(node: Nodes, problems: ArticleProblem[]): void {
  if (node.type === "html") problems.push({ syntax: "html", line: lineOf(node) })

  const destination = destinationOf(node)
  if (destination !== null && linkHref(destination) === null) {
    problems.push({ syntax: "link", line: lineOf(node) })
  }

  if ("children" in node) {
    for (const child of node.children) walk(child, problems)
  }
}

/**
 * Everything about the source a page cannot hold, in the order it was written.
 * **All the problems are reported, not the first one** — a body is fixed once,
 * and finding out about the second tag only after the first is two round trips
 * for one edit.
 */
export function checkArticleBody(source: string): ArticleProblem[] {
  const problems: ArticleProblem[] = []
  walk(processor.parse(source), problems)
  return problems.sort((a, b) => a.line - b.line)
}
