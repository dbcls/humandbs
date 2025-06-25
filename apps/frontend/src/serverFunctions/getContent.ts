import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { localeSchema } from "./i18n-config";
import fs from "fs/promises";
import Markdoc from "@markdoc/markdoc";
import * as tags from "@/markdoc/tags/index";
import * as nodes from "@/markdoc/nodes/index";

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

export const getContent = createServerFn({ method: "GET", response: "data" })
  .validator(contentReqSchema)
  .handler(async ({ data }) => {
    const raw = await getFileContent(data);
    const ast = Markdoc.parse(raw);
    const content = Markdoc.transform(ast, {
      tags,
      nodes,
    });

    return content as any;
  });
