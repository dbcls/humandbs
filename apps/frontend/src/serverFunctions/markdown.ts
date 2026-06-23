import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { renderMarkdown } from "@/utils/markdown";

/** Render arbitrary markdown on server and return html */
export const $renderMarkdown = createServerFn()
  .inputValidator(z.object({ raw: z.string() }))
  .handler(async ({ data }) => {
    const mdResult = await renderMarkdown(data.raw);
    return mdResult.markup;
  });
