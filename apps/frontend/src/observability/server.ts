import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";

import type { SpanContext } from "@opentelemetry/api";
import { context, trace } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import type { LogRecordExporter, ReadableLogRecord } from "@opentelemetry/sdk-logs";
import { LoggerProvider, SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

import type { LogLevel, ObservabilityConfig } from "./config";
import { getObservabilityConfig } from "./config";

export type EventName =
  | "server.startup"
  | "server.startup_failed"
  | "server.unhandled_error"
  | "request.completed"
  | "backend.request"
  | "browser.error"
  | "document.view"
  | "cms.action";

type EventAttributes = Record<string, boolean | number | string | undefined>;

interface RequestContext {
  requestId: string;
  spanContext: SpanContext;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();
const config = getObservabilityConfig(process.env);
const sensitiveKey =
  /(?:authorization|cookie|credential|password|secret|token|body|content|form|query|header)/i;
const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};
const severityFor: Record<LogLevel, SeverityNumber> = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  fatal: SeverityNumber.FATAL,
};

class FirstFingerprintCache {
  private readonly entries = new Map<string, number>();

  first(fingerprint: string) {
    const now = Date.now();
    for (const [key, expiry] of this.entries) {
      if (expiry <= now) this.entries.delete(key);
    }
    if (this.entries.has(fingerprint)) return false;
    if (this.entries.size >= config.errorFingerprintCacheSize) {
      const oldest = this.entries.keys().next().value;
      if (oldest) this.entries.delete(oldest);
    }
    this.entries.set(fingerprint, now + config.errorFingerprintTtlMs);
    return true;
  }
}

const fingerprints = new FirstFingerprintCache();
const deploymentEnvironmentAttribute = "deployment.environment.name";

function asTimestamp(record: ReadableLogRecord) {
  const [seconds, nanoseconds] = record.hrTime;
  return new Date(seconds * 1_000 + Math.floor(nanoseconds / 1_000_000)).toISOString();
}

class StdoutJsonExporter implements LogRecordExporter {
  export(records: ReadableLogRecord[], callback: (result: { code: number }) => void) {
    try {
      for (const record of records) {
        const attributes = record.attributes as Record<string, unknown>;
        const resource = record.resource.attributes as Record<string, unknown>;
        const output = {
          timestamp: asTimestamp(record),
          severity: record.severityText ?? "info",
          event: record.eventName ?? "unknown",
          service: resource[ATTR_SERVICE_NAME],
          service_version: resource[ATTR_SERVICE_VERSION],
          deployment_environment: resource[deploymentEnvironmentAttribute],
          logger: record.instrumentationScope.name,
          ...attributes,
          trace_id: record.spanContext?.traceId,
          span_id: record.spanContext?.spanId,
        };
        process.stdout.write(`${JSON.stringify(output)}\n`);
      }
      callback({ code: 0 });
    } catch {
      // Observability must not affect the request that produced the record.
      callback({ code: 1 });
    }
  }

  shutdown() {
    return Promise.resolve();
  }
}

const provider = new LoggerProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion,
    [deploymentEnvironmentAttribute]: config.environment,
  }),
  processors: [new SimpleLogRecordProcessor(new StdoutJsonExporter())],
});

// The logger API is intentionally the only application-facing OTel boundary.
logs.setGlobalLoggerProvider(provider);
const logger = logs.getLogger("humandbs.frontend", config.serviceVersion);

function normalizePath(path: string) {
  try {
    return new URL(path, "http://observability.invalid").pathname;
  } catch {
    return "/";
  }
}

function redact(attributes: EventAttributes): Record<string, boolean | number | string> {
  const redacted: Record<string, boolean | number | string> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || sensitiveKey.test(key)) continue;
    redacted[key] =
      typeof value === "string" ? value.replace(/[?&][^=&#/]+=[^&#\s]*/g, "[redacted]") : value;
  }
  return redacted;
}

function deterministicSample(key: string) {
  const sample = Number.parseInt(createHash("sha256").update(key).digest("hex").slice(0, 8), 16);
  return sample / 0x1_0000_0000 < config.sampleRate;
}

function shouldEmit(
  event: EventName,
  level: LogLevel,
  attributes: EventAttributes,
  sampleable: boolean,
) {
  if (levelOrder[level] < levelOrder[config.logLevel]) return false;
  if (!sampleable || config.environment !== "production") return true;
  const fingerprint = attributes.error_fingerprint;
  if (typeof fingerprint === "string" && fingerprints.first(fingerprint)) return true;
  return deterministicSample(
    `${event}:${attributes.request_id ?? attributes.document_id ?? fingerprint ?? "global"}`,
  );
}

export function isValidRequestId(value: string | null) {
  return value !== null && /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/.test(value);
}

export function createRequestContext(requestId: string = randomUUID()): RequestContext {
  const traceId = createHash("sha256").update(`${requestId}:trace`).digest("hex").slice(0, 32);
  const spanId = createHash("sha256").update(`${requestId}:span`).digest("hex").slice(0, 16);
  return { requestId, spanContext: { traceId, spanId, traceFlags: 1, isRemote: false } };
}

export function runWithRequestContext<T>(requestId: string, operation: () => T): T {
  const requestContext = createRequestContext(requestId);
  const otelContext = trace.setSpan(
    context.active(),
    trace.wrapSpanContext(requestContext.spanContext),
  );
  return requestContextStorage.run(requestContext, () => context.with(otelContext, operation));
}

export function getRequestId() {
  return requestContextStorage.getStore()?.requestId;
}

export function getObservabilitySettings(): Readonly<ObservabilityConfig> {
  return config;
}

export function fingerprintError(error: unknown) {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : "Unknown server error";
  return createHash("sha256")
    .update(`${name}:${message.slice(0, 256)}`)
    .digest("hex")
    .slice(0, 24);
}

export function errorCategory(error: unknown) {
  if (error instanceof Error && /unauthori[sz]ed|forbidden/i.test(error.message))
    return "authorization";
  if (error instanceof Error && /valid|not found|invalid/i.test(error.message)) return "validation";
  return "unexpected";
}

export function emitEvent(
  event: EventName,
  attributes: EventAttributes = {},
  options: { level?: LogLevel; sampleable?: boolean } = {},
) {
  try {
    const level = options.level ?? "info";
    const requestContext = requestContextStorage.getStore();
    const safeAttributes = redact({
      ...attributes,
      request_id: attributes.request_id ?? requestContext?.requestId,
      sampling_rate: options.sampleable ? config.sampleRate : 1,
    });
    if (!shouldEmit(event, level, safeAttributes, options.sampleable ?? false)) return;
    logger.emit({
      eventName: event,
      severityText: level,
      severityNumber: severityFor[level],
      attributes: safeAttributes,
      context: requestContext
        ? trace.setSpan(context.active(), trace.wrapSpanContext(requestContext.spanContext))
        : undefined,
    });
  } catch {
    // A broken SDK/exporter is always isolated from feature behavior.
  }
}

export function emitError(event: EventName, error: unknown, attributes: EventAttributes = {}) {
  emitEvent(
    event,
    {
      ...attributes,
      error_category: errorCategory(error),
      error_name: error instanceof Error ? error.name.slice(0, 120) : "UnknownError",
      error_fingerprint: fingerprintError(error),
    },
    { level: "error", sampleable: true },
  );
}

export async function auditMutation<T>(
  action: string,
  resourceType: string,
  resourceId: string | undefined,
  operation: () => Promise<T> | T,
): Promise<T> {
  try {
    const result = await operation();
    emitEvent("cms.action", { action, resource_type: resourceType, resource_id: resourceId });
    return result;
  } catch (error) {
    emitError("cms.action", error, {
      action,
      resource_type: resourceType,
      resource_id: resourceId,
    });
    throw error;
  }
}

export function shutdownObservability() {
  return provider.shutdown().catch(() => undefined);
}

interface ClientErrorPayload {
  source: "runtime" | "unhandled-rejection" | "route-boundary";
  errorName: string;
  path: string;
  release?: string;
  clientId: string;
}

const clientErrorPayload = {
  valid(value: unknown): value is ClientErrorPayload {
    if (!value || typeof value !== "object") return false;
    const payload = value as Partial<ClientErrorPayload>;
    return (
      (payload.source === "runtime" ||
        payload.source === "unhandled-rejection" ||
        payload.source === "route-boundary") &&
      typeof payload.errorName === "string" &&
      /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(payload.errorName) &&
      typeof payload.path === "string" &&
      payload.path.startsWith("/") &&
      !payload.path.includes("?") &&
      payload.path.length <= 2_048 &&
      typeof payload.clientId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        payload.clientId,
      ) &&
      (payload.release === undefined ||
        (typeof payload.release === "string" && payload.release.length <= 120))
    );
  },
};

const clientWindows = new Map<string, { count: number; resetAt: number }>();

export async function handleClientErrorReport(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > config.clientErrorMaxBytes) return new Response(null, { status: 413 });
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > config.clientErrorMaxBytes) {
      return new Response(null, { status: 413 });
    }
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response(null, { status: 400 });
    }
    if (!clientErrorPayload.valid(payload)) return new Response(null, { status: 400 });

    const now = Date.now();
    const current = clientWindows.get(payload.clientId);
    if (!current || current.resetAt <= now) {
      clientWindows.set(payload.clientId, {
        count: 1,
        resetAt: now + config.clientErrorRateWindowMs,
      });
    } else if (current.count >= config.clientErrorRateLimit) {
      return new Response(null, { status: 429 });
    } else {
      current.count += 1;
    }

    emitEvent(
      "browser.error",
      {
        source: payload.source,
        error_name: payload.errorName,
        error_fingerprint: `${payload.source}:${payload.errorName}:${payload.path}`,
        route: normalizePath(payload.path),
        client_id: payload.clientId,
        release: payload.release,
      },
      { level: "error", sampleable: true },
    );
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 400 });
  }
}
