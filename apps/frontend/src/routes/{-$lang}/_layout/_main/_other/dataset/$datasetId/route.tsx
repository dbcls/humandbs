import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/dataset/$datasetId",
)({
  validateSearch: z.object({ addToCart: z.string().optional() }),
  loader: ({ params }) => {
    return {
      crumb: params.datasetId,
    };
  },
});
