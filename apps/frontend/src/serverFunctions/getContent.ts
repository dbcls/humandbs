import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { localeSchema } from "../lib/i18n-config";
import fs from "fs/promises";
import { Parser } from "htmlparser2";
import Markdoc, { Tokenizer } from "@markdoc/markdoc";
import * as tags from "@/markdoc/tags/index";
import * as nodes from "@/markdoc/nodes/index";

type Tokens = ReturnType<typeof Tokenizer.prototype.tokenize>;

const contentPath = "./localization/content";

const contensNameSchema = z.enum([
  "about",
  "home",
  "front",
  "data-submission",
  "data-usage",
]);

type ContentNames = z.infer<typeof contensNameSchema>;

async function getFileContent({
  contentName,
  lang,
}: {
  contentName: ContentNames;
  lang: string;
}) {
  const file = await fs.readFile(`${contentPath}/${lang}/${contentName}.md`, {
    encoding: "utf-8",
  });

  return file;
}

const contentReqSchema = z.object({
  contentName: contensNameSchema,
  lang: localeSchema,
});

const config = {
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
};

function processTokens(tokens: Tokens) {
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

const tokenizer = new Markdoc.Tokenizer({ html: true });

export const getContent = createServerFn({ method: "GET", response: "data" })
  .validator(contentReqSchema)
  .handler(async ({ data }) => {
    const raw = await getFileContent(data);
    const tokens = tokenizer.tokenize(raw);
    const processed = processTokens(tokens);
    const ast = Markdoc.parse(processed);
    const content = Markdoc.transform(ast, config);

    return content as any;
  });
