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
