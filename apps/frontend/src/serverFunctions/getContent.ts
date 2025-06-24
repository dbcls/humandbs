import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as fs from "fs/promises";
import { i18n } from "./i18n-config";

const contentPath = "./localization/content";

const contensNameSchema = z.enum(["about", "home"]);

type ContentNames = z.infer<typeof contensNameSchema>;

async function getFileContent({
  contentName,
  locale,
}: {
  contentName: ContentNames;
  locale: string;
}) {
  const file = await fs.readFile(`${contentPath}/${locale}/${contentName}.md`, {
    encoding: "utf-8",
  });

  return file;
}

function unionOfLiterals<T extends string | number>(constants: readonly T[]) {
  const literals = constants.map((x) => z.literal(x)) as unknown as readonly [
    z.ZodLiteral<T>,
    z.ZodLiteral<T>,
    ...z.ZodLiteral<T>[],
  ];
  return z.union(literals);
}

const contentReqSchema = z.object({
  contentName: contensNameSchema,
  lang: unionOfLiterals(i18n.locales),
});

export const getContent = createServerFn({ method: "GET" })
  .validator(contentReqSchema)
  .handler(async ({ data }) => {
    return getFileContent({
      contentName: data.contentName,
      locale: data.lang,
    });
  });
