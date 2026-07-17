import { useEffect } from "react";

import { reportClientError } from "@/observability/client";

export function ClientObservabilityReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => reportClientError(event.error, "runtime");
    const onRejection = (event: PromiseRejectionEvent) =>
      reportClientError(event.reason, "unhandled-rejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
