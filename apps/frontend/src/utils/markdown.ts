// src/utils/markdown.ts
import type { Element, Root } from "hast";
import type { Node, Parent } from "mdast";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";

export interface MarkdownHeading {
  id: string;
  text: string;
  level: number;
}

export interface MarkdownResult {
  markup: string;
  headings: MarkdownHeading[];
}

function parseTagAttributes(rawAttributes: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributeRegex =
    /([A-Za-z_][\w.-]*)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"']+)))?/g;
  let match: RegExpExecArray | null;

  match = attributeRegex.exec(rawAttributes);
  while (match) {
    const key = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? "true";
    attributes[key] = value;
    match = attributeRegex.exec(rawAttributes);
  }

  return attributes;
}

function getNodeText(node: {
  type: string;
  value?: string;
  children?: unknown[];
}): string {
  if (node.type === "text") {
    return node.value ?? "";
  }
  if (!Array.isArray(node.children)) {
    return "";
  }
  return node.children
    .map((child) =>
      getNodeText(
        child as { type: string; value?: string; children?: unknown[] },
      ),
    )
    .join("");
}

function rehypeShiftHeadings() {
  return (tree: Root) => {
    const levels: number[] = [];
    visit(tree, "element", (node: Element) => {
      const m = /^h([1-6])$/.exec(node.tagName);
      if (m) levels.push(Number(m[1]));
    });
    const minLevel = levels.length ? Math.min(...levels) : null;
    if (minLevel !== 1) return;
    visit(tree, "element", (node: Element) => {
      const m = /^h([1-6])$/.exec(node.tagName);
      if (m) node.tagName = `h${Math.min(Number(m[1]) + 1, 6)}`;
    });
  };
}

function collectHeadings(headings: MarkdownHeading[]) {
  return () => (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (!/^h[1-6]$/.test(node.tagName)) {
        return;
      }

      const level = Number(node.tagName[1]);
      const id =
        typeof node.properties?.id === "string" ? node.properties.id : "";
      const text = getNodeText(node).trim();

      if (!id || !text) {
        return;
      }

      headings.push({ id, text, level });
    });
  };
}

// Ensure blank lines around ::: markers so remark parses them as separate paragraphs.
function normalizeCalloutFences(content: string): string {
  return content
    .replace(/^([ \t]*:::(?:\s*callout.*)?)\s*$/gim, "\n$1\n")
    .replace(/\n{3,}/g, "\n\n");
}

function getMdastText(node: Node): string {
  if (node.type === "text")
    return (node as unknown as { value: string }).value ?? "";
  const parent = node as Parent;
  if (!parent.children) return "";
  return parent.children.map(getMdastText).join("");
}

function isClosingMarker(node: Node): boolean {
  return (
    node.type === "paragraph" && /^:::\s*$/.test(getMdastText(node).trim())
  );
}

function hasClosingMarker(node: Node): boolean {
  if (isClosingMarker(node)) return true;
  const parent = node as Parent;
  if (!parent.children) return false;
  return parent.children.some(hasClosingMarker);
}

// Find and remove the first closing ::: paragraph anywhere in the subtree.
function removeClosingMarker(node: Node): boolean {
  const parent = node as Parent;
  if (!parent.children) return false;
  for (let i = 0; i < parent.children.length; i++) {
    if (isClosingMarker(parent.children[i])) {
      parent.children.splice(i, 1);
      return true;
    }
    if (removeClosingMarker(parent.children[i])) return true;
  }
  return false;
}

function processCalloutChildren(children: Node[]): void {
  // Recurse into container nodes first
  for (const node of children) {
    const parent = node as Parent;
    if (parent.children && node.type !== "paragraph") {
      processCalloutChildren(parent.children);
    }
  }

  let i = 0;
  while (i < children.length) {
    const node = children[i];
    if (node.type !== "paragraph") {
      i++;
      continue;
    }

    const paraText = getMdastText(node).trim();
    const openMatch = /^:::\s*callout\s*(.*)$/i.exec(paraText);
    if (!openMatch) {
      i++;
      continue;
    }

    const attrStr = openMatch[1].trim();

    // Remove opening marker and collect remaining siblings
    const remaining = children.splice(i + 1);
    children.splice(i, 1);

    // Search for closing ::: first as a direct sibling, then as a descendant
    const closingSiblingIdx = remaining.findIndex(isClosingMarker);
    let inner: Node[];

    if (closingSiblingIdx !== -1) {
      inner = remaining.splice(0, closingSiblingIdx);
      remaining.splice(0, 1); // remove closing :::
    } else {
      const closingDescIdx = remaining.findIndex(hasClosingMarker);
      if (closingDescIdx === -1) {
        // No closing marker found — restore and skip
        children.splice(i, 0, node, ...remaining);
        i++;
        continue;
      }
      inner = remaining.splice(0, closingDescIdx + 1);
      removeClosingMarker(inner[inner.length - 1]);
    }

    children.splice(
      i,
      0,
      {
        type: "callout",
        data: { hName: "callout", hProperties: parseTagAttributes(attrStr) },
        children: inner,
      } as unknown as Node,
      ...remaining,
    );
    i++;
  }
}

function remarkCallouts() {
  return (tree: Parent) => processCalloutChildren(tree.children);
}

export async function renderMarkdown(content: string): Promise<MarkdownResult> {
  const headings: MarkdownHeading[] = [];
  content = normalizeCalloutFences(content);

  const result = await unified()
    .use(remarkParse) // Parse markdown
    .use(remarkGfm) // Support GitHub Flavored Markdown
    .use(remarkCallouts) // Convert :::callout blocks to <callout> elements
    .use(remarkRehype, { allowDangerousHtml: true }) // Convert to HTML AST
    .use(rehypeRaw) // Process raw HTML
    .use(rehypeShiftHeadings) // Shift h1→h2 etc. when content uses h1 as top-level
    .use(rehypeSlug) // Add IDs to headings
    .use(collectHeadings(headings)) // Collect headings with generated IDs
    .use(rehypeAutolinkHeadings, {
      behavior: "prepend",
      properties: { className: ["anchor"] },
    })

    .use(rehypeStringify) // Serialize to HTML string

    .process(content);

  return {
    markup: String(result),
    headings,
  };
}
