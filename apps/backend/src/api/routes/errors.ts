import { ErrorResponseSchema } from "@/types"

export const ErrorSpec401 = {
  content: {
    "application/json": {
      schema: ErrorResponseSchema,
    },
  },
  description: "Unauthorized",
}

export const ErrorSpec403 = {
  content: {
    "application/json": {
      schema: ErrorResponseSchema,
    },
  },
  description: "Forbidden",
}

export const ErrorSpec404 = {
  content: {
    "application/json": {
      schema: ErrorResponseSchema,
    },
  },
  description: "Not Found",
}

export const ErrorSpec500 = {
  content: {
    "application/json": {
      schema: ErrorResponseSchema,
    },
  },
  description: "Internal Server Error",
}
