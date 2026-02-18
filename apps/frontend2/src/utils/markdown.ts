// src/utils/markdown.ts
import type { Element, Root } from "hast";
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
