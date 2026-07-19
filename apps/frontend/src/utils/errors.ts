import { APIError } from "@/services/backend";

export function throwSerializableApiError(error: unknown): never {
  if (error instanceof APIError) {
    throw {
      name: "APIError",
      message: error.message,
      status: error.status,
      data: error.data,
    };
  }

  throw error;
}

/**
 * Detects a 404 from a (possibly serialized) API error. Server functions
 * serialize APIError into a plain object via `throwSerializableApiError`, so
 * we match on shape rather than `instanceof`.
 */
export function isApiNotFoundError(error: unknown): boolean {
  if (error instanceof APIError) return error.status === 404;

  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "APIError" &&
    "status" in error &&
    (error as { status?: unknown }).status === 404
  );
}
