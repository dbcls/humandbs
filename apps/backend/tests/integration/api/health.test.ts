/**
 * IT-HEALTH-*: Health check (`src/api/routes/health.ts`).
 *
 * Reference: `tests/integration-scenarios.md § IT-HEALTH-*`.
 */
import { beforeAll, describe, expect, it } from "bun:test"

import { getApp, setupIntegration, url } from "./setup"

beforeAll(setupIntegration)

describe("IT-HEALTH-*: health endpoint", () => {
  it("IT-HEALTH-01: returns ok with ISO 8601 timestamp within ±60s and JSON content-type", async () => {
    // IT-HEALTH-01
    // Invariants: 200; body { status: "ok", timestamp: ISO 8601 }; Content-Type=application/json;
    // timestamp parses to a date within ±60s of wall-clock; reachable without auth.
    const app = getApp()
    const before = Date.now()
    const res = await app.request(url("/health"))
    const after = Date.now()
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type") ?? "").toMatch(/application\/json/)

    const json = (await res.json()) as { status: string; timestamp: string }
    expect(json.status).toBe("ok")
    const ts = Date.parse(json.timestamp)
    expect(Number.isNaN(ts)).toBe(false)
    expect(ts).toBeGreaterThanOrEqual(before - 60_000)
    expect(ts).toBeLessThanOrEqual(after + 60_000)
  })

  // IT-HEALTH-02: ES が落ちている状態は通常の integration では再現困難。
  // 仕様上 /health は ES に問い合わせないことは `src/api/routes/health.ts` の実装で固定されている (上記 IT-HEALTH-01 と同一ハンドラ)。
  // 接続不可状態の検証は `tests/integration-scenarios.md § IT-HEALTH-02` の注釈どおり、専用プロセスで `HUMANDBS_ES_HOST=localhost:1` 等を設定して別途実施する。
})
