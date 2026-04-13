import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { NavigationData } from "@/components/NavigationChart";
import { localeSchema } from "@/config/i18n";

export const $getNavigationFlowchartData = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      type: z.union([
        z.literal("data-submission"),
        z.literal("before-application"),
      ]),
      locale: localeSchema,
    }),
  )
  .handler(async ({ data }) => {
    const { type, locale } = data;

    const file = Bun.file(`./src/config/navigation/${type}-${locale}.json`);

    return (await file.json()) as NavigationData;
  });
