import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { NavigationData } from "@/components/NavigationChart";

import { getLocaleFn } from "./locale";

export const $getNavigationFlowchartData = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      type: z.union([
        z.literal("data-submission"),
        z.literal("before-application"),
      ]),
    })
  )
  .handler(async ({ data }) => {
    const locale = await getLocaleFn();

    const type = data.type;

    const file = Bun.file(`./src/config/navigation/${type}-${locale}.json`);

    return (await file.json()) as NavigationData;
  });
