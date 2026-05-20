export function isCancelledError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as {
    name?: string;
    message?: string;
    constructor?: { name?: string };
  };

  return (
    maybeError.name === "AbortError" ||
    maybeError.name === "CancelledError" ||
    maybeError.message === "CancelledError" ||
    maybeError.constructor?.name === "CancelledError"
  );
}
