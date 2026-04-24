import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-use/datasets/$datasetId",
)({
  validateSearch: z.object({ addToCart: z.string().optional() }),
  loader: ({ params }) => {
    return {
      crumb: params.datasetId,
    };
  },
});
