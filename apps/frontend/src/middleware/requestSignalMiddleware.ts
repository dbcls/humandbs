import { createMiddleware } from "@tanstack/react-start";

/**
 * Adds AbortSignal to request context
 */
export const requestSignalMiddleware = createMiddleware().server(async ({ request, next }) => {
  return next({
    context: {
      requestSignal: request.signal,
    },
  });
});
