export type ObservabilityEnvironment = "development" | "production" | "test";
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface ObservabilityConfig {
  environment: ObservabilityEnvironment;
  serviceName: string;
  serviceVersion: string;
  logLevel: LogLevel;
  sampleRate: number;
  clientErrorMaxBytes: number;
  clientErrorRateLimit: number;
  clientErrorRateWindowMs: number;
  errorFingerprintCacheSize: number;
  errorFingerprintTtlMs: number;
}

function numberFromEnvironment(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function environmentFrom(value: string | undefined): ObservabilityEnvironment {
  if (value === "production" || value === "test" || value === "development") return value;
  return value === "prod" ? "production" : "development";
}

export function getObservabilityConfig(
  environment: Record<string, string | undefined>,
): ObservabilityConfig {
  const runtimeEnvironment = environmentFrom(environment.HUMANDBS_ENV ?? environment.NODE_ENV);

  return {
    environment: runtimeEnvironment,
    serviceName: environment.OTEL_SERVICE_NAME ?? "humandbs-frontend",
    serviceVersion:
      environment.OTEL_SERVICE_VERSION ?? environment.npm_package_version ?? "unknown",
    logLevel: (environment.OBSERVABILITY_LOG_LEVEL as LogLevel | undefined) ?? "info",
    sampleRate: numberFromEnvironment(
      environment.OBSERVABILITY_SAMPLE_RATE,
      runtimeEnvironment === "production" ? 0.1 : 1,
      0,
      1,
    ),
    clientErrorMaxBytes: numberFromEnvironment(
      environment.OBSERVABILITY_CLIENT_ERROR_MAX_BYTES,
      4_096,
      256,
      65_536,
    ),
    clientErrorRateLimit: numberFromEnvironment(
      environment.OBSERVABILITY_CLIENT_ERROR_RATE_LIMIT,
      20,
      1,
      1_000,
    ),
    clientErrorRateWindowMs: numberFromEnvironment(
      environment.OBSERVABILITY_CLIENT_ERROR_RATE_WINDOW_MS,
      60_000,
      1_000,
      3_600_000,
    ),
    errorFingerprintCacheSize: numberFromEnvironment(
      environment.OBSERVABILITY_ERROR_FINGERPRINT_CACHE_SIZE,
      1_000,
      1,
      100_000,
    ),
    errorFingerprintTtlMs: numberFromEnvironment(
      environment.OBSERVABILITY_ERROR_FINGERPRINT_TTL_MS,
      3_600_000,
      1_000,
      86_400_000,
    ),
  };
}
