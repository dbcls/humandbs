import { ErrorResponseSchema } from "@/types"

/**
 * Factory function to create OpenAPI error response spec
 */
const createErrorSpec = (description: string) => ({
  content: {
    "application/json": {
      schema: ErrorResponseSchema,
    },
  },
  description,
})

// Error response specs for OpenAPI routes
export const ErrorSpec400 = createErrorSpec("Bad Request")
export const ErrorSpec401 = createErrorSpec("Unauthorized")
export const ErrorSpec403 = createErrorSpec("Forbidden")
export const ErrorSpec404 = createErrorSpec("Not Found")
export const ErrorSpec409 = createErrorSpec("Conflict")
export const ErrorSpec500 = createErrorSpec("Internal Server Error")
