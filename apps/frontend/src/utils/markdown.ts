// src/utils/markdown.ts
import type { Element, ElementContent, Root, RootContent } from "hast";
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

function getParagraphText(node: Element): string {
  if (node.tagName !== "p") {
    return "";
  }
  return getNodeText(node).trim();
}

function isElementContent(node: RootContent): node is ElementContent {
  return node.type !== "doctype";
}

function transformCustomContainers() {
  return (tree: Root) => {
    const nextChildren: Root["children"] = [];
    const children = tree.children;
    let index = 0;

    while (index < children.length) {
      const current = children[index];

      if (
        current.type !== "element" ||
        current.tagName !== "p" ||
        !/^:::\s*callout(?:\s+.*)?$/i.test(getParagraphText(current))
      ) {
        nextChildren.push(current);
        index += 1;
        continue;
      }

      const markerText = getParagraphText(current);
      const markerMatch = /^:::\s*callout(?:\s+(.*))?$/i.exec(markerText);
      const attributes = parseTagAttributes(markerMatch?.[1] ?? "");

      let closingIndex = index + 1;
      while (closingIndex < children.length) {
        const candidate = children[closingIndex];
        if (
          candidate.type === "element" &&
          candidate.tagName === "p" &&
          /^:::\s*$/.test(getParagraphText(candidate))
        ) {
          break;
        }
        closingIndex += 1;
      }

      if (closingIndex >= children.length) {
        nextChildren.push(current);
        index += 1;
        continue;
      }

      const innerChildren = children
        .slice(index + 1, closingIndex)
        .filter(isElementContent);
      nextChildren.push({
        type: "element",
        tagName: "callout",
        properties: attributes,
        children: innerChildren,
      });

      index = closingIndex + 1;
    }

    tree.children = nextChildren;
  };
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

export async function renderMarkdown(content: string): Promise<MarkdownResult> {
  const headings: MarkdownHeading[] = [];

  const result = await unified()
    .use(remarkParse) // Parse markdown
    .use(remarkGfm) // Support GitHub Flavored Markdown
    .use(remarkRehype, { allowDangerousHtml: true }) // Convert to HTML AST
    .use(rehypeRaw) // Process raw HTML in markdown
    .use(transformCustomContainers) // Convert :::callout blocks to elements
    .use(rehypeSlug) // Add IDs to headings
    .use(collectHeadings(headings)) // Collect headings with generated IDs
    .use(rehypeAutolinkHeadings, {
      behavior: "wrap",
      properties: { className: ["anchor"] },
    })

    .use(rehypeStringify) // Serialize to HTML string

    .process(content);

  return {
    markup: String(result),
    headings,
  };
}
