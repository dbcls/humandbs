import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { NavigationData } from "@/components/NavigationChart";

import { $getLocale } from "./i18n";

export const $getNavigationFlowchartData = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      type: z.union([
        z.literal("data-submission"),
        z.literal("before-application"),
      ]),
    }),
  )
  .handler(async ({ data }) => {
    const locale = await $getLocale();

    const type = data.type;

    const file = Bun.file(`./src/config/navigation/${type}-${locale}.json`);

    return (await file.json()) as NavigationData;
  });
