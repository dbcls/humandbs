import * as tags from "@/markdoc/tags";
import * as nodes from "@/markdoc/nodes";
import Markdoc, { Config, Tag } from "@markdoc/markdoc";
import { Parser } from "htmlparser2";
import yaml from "js-yaml";
import { Locale } from "@/lib/i18n-config";

export const config = {
  tags: {
    ...tags,
    "html-tag": {
      attributes: {
        name: { type: String, required: true },
        attrs: { type: Object },
      },
      transform(node, config) {
        const { name, attrs } = node.attributes;
        const children = node.transformChildren(config);
        return new Markdoc.Tag(name, attrs, children);
      },
    },
  },
  nodes,
  variables: {} as {
    version?: number;
    // TODO: updated by user?
    updatedAt?: Date | string | undefined;
    frontmatter?: Record<string, string | number>;
  },
} satisfies Config;

type Tokens = ReturnType<typeof Markdoc.Tokenizer.prototype.tokenize>;

/**
 * For including HTML from markdown as-is
 */
export function processTokens(tokens: Tokens) {
  const output: any[] = [];

  const parser = new Parser({
    onopentag(name, attrs) {
      output.push({
        type: "tag_open",
        nesting: 1,
        meta: {
          tag: "html-tag",
          attributes: [
            { type: "attribute", name: "name", value: name },
            { type: "attribute", name: "attrs", value: attrs },
          ],
        },
      });
    },

    ontext(content) {
      if (typeof content === "string" && content.trim().length > 0)
        output.push({ type: "text", content });
    },

    onclosetag(name) {
      output.push({
        type: "tag_close",
        nesting: -1,
        meta: { tag: "html-tag" },
      });
    },
  });

  for (const token of tokens) {
    if (token.type.startsWith("html")) {
      parser.write(token.content);
      continue;
    }

    // @ts-expect-error
    if (token.type === "inline") token.children = processTokens(token.children);

    output.push(token);
  }

  return output;
}

export const tokenizer = new Markdoc.Tokenizer({ html: true });

export type Heading = {
  title: string;
  id: string | number;
  level: number;
  [x: string]: string | number;
} & {};

/**
 * Function to generate headings from content
 */
export function collectHeadings(
  node: Tag | Tag["children"][number],
  sections: Heading[] = []
) {
  if (node instanceof Markdoc.Tag) {
    // Match all h1, h2, h3… tags
    if (node.name.match(/h\d/)) {
      const title = node.children[0];

      if (typeof title === "string") {
        sections.push({
          ...node.attributes,
          title,
        } as Heading);
      }
    }

    if (node.children) {
      for (const child of node.children) {
        collectHeadings(child, sections);
      }
    }
  }

  return sections;
}

export function transformMarkdoc({
  rawContent,
  includeFrontmatter = false,
  generateTOC = false,
}: {
  rawContent: string;
  includeFrontmatter?: boolean;
  generateTOC?: boolean;
}) {
  const tokens = tokenizer.tokenize(rawContent);
  const processed = processTokens(tokens);
  const ast = Markdoc.parse(processed);

  const frontmatter = (
    ast.attributes.frontmatter && includeFrontmatter
      ? yaml.load(ast.attributes.frontmatter, {
          schema: yaml.FAILSAFE_SCHEMA,
        })
      : {}
  ) as Record<string, string | number>;

  config.variables = {
    frontmatter,
  };

  const content = Markdoc.transform(ast, config);

  const toc = generateTOC ? collectHeadings(content) : null;

  return { content, toc };
}
