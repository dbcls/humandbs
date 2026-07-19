import { describe, expect, test } from "bun:test";

import { getObservabilityConfig } from "./config";

describe("observability configuration", () => {
  test("uses full capture outside production", () => {
    expect(getObservabilityConfig({ HUMANDBS_ENV: "development" }).sampleRate).toBe(1);
  });

  test("uses safe production defaults and ignores invalid overrides", () => {
    const config = getObservabilityConfig({
      HUMANDBS_ENV: "production",
      OBSERVABILITY_SAMPLE_RATE: "not-a-rate",
      OBSERVABILITY_CLIENT_ERROR_MAX_BYTES: "-1",
    });
    expect(config.sampleRate).toBe(0.1);
    expect(config.clientErrorMaxBytes).toBe(4096);
  });

  test("accepts bounded operational overrides", () => {
    const config = getObservabilityConfig({
      HUMANDBS_ENV: "production",
      OBSERVABILITY_SAMPLE_RATE: "0.25",
      OBSERVABILITY_CLIENT_ERROR_RATE_LIMIT: "5",
    });
    expect(config.sampleRate).toBe(0.25);
    expect(config.clientErrorRateLimit).toBe(5);
  });
});
