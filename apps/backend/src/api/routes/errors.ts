import { ApiErrorResponseSchema } from "@/api/types"
import { ErrorResponseSchema } from "@/types"

// Legacy error specs (for backward compatibility with existing routes)
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

// New API error specs (using ApiErrorResponseSchema)
export const ApiErrorSpec400 = {
  content: {
    "application/json": {
      schema: ApiErrorResponseSchema,
    },
  },
  description: "Bad Request",
}

export const ApiErrorSpec401 = {
  content: {
    "application/json": {
      schema: ApiErrorResponseSchema,
    },
  },
  description: "Unauthorized",
}

export const ApiErrorSpec403 = {
  content: {
    "application/json": {
      schema: ApiErrorResponseSchema,
    },
  },
  description: "Forbidden",
}

export const ApiErrorSpec404 = {
  content: {
    "application/json": {
      schema: ApiErrorResponseSchema,
    },
  },
  description: "Not Found",
}

export const ApiErrorSpec409 = {
  content: {
    "application/json": {
      schema: ApiErrorResponseSchema,
    },
  },
  description: "Conflict",
}

export const ApiErrorSpec500 = {
  content: {
    "application/json": {
      schema: ApiErrorResponseSchema,
    },
  },
  description: "Internal Server Error",
}

// Backward compatibility aliases
export const ErrorSpec400 = ApiErrorSpec400
export const ErrorSpec409 = ApiErrorSpec409
