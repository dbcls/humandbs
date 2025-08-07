import { ErrorResponseSchema } from "@/types"

export const ErrorSpec500 = {
  content: {
    "application/json": {
      schema: ErrorResponseSchema,
    },
  },
  description: "Internal Server Error",
}
