export type ClientErrorSource = "runtime" | "unhandled-rejection" | "route-boundary";

interface ClientErrorReport {
  source: ClientErrorSource;
  errorName: string;
  path: string;
  release?: string;
  clientId: string;
}

const clientIdKey = "humandbs-observability-client-id";

function getClientId() {
  try {
    const existing = sessionStorage.getItem(clientIdKey);
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(clientIdKey, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function safeErrorName(error: unknown) {
  if (!(error instanceof Error) || !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(error.name)) {
    return "UnknownError";
  }
  return error.name;
}

export function reportClientError(error: unknown, source: ClientErrorSource) {
  try {
    const report: ClientErrorReport = {
      source,
      errorName: safeErrorName(error),
      path: window.location.pathname,
      release: import.meta.env.VITE_APP_VERSION,
      clientId: getClientId(),
    };
    void fetch("/api/observability/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report),
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Error reporting must never delay rendering, navigation, or recovery.
  }
}
