import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { handleClientErrorReport, isValidRequestId } from "./server";

describe("request identifiers", () => {
  test("accepts opaque trusted IDs and rejects unsafe values", () => {
    expect(isValidRequestId("edge-request-123")).toBe(true);
    expect(isValidRequestId("short")).toBe(false);
    expect(isValidRequestId("request\nspoofed")).toBe(false);
  });
});

describe("browser error endpoint", () => {
  test("accepts only the allowlisted error shape", async () => {
    const response = await handleClientErrorReport(
      new Request("http://localhost/api/observability/client-errors", {
        method: "POST",
        body: JSON.stringify({
          source: "runtime",
          errorName: "TypeError",
          path: "/documents/example",
          clientId: randomUUID(),
        }),
      }),
    );
    expect(response.status).toBe(204);
  });

  test("rejects query values and malformed payloads", async () => {
    const response = await handleClientErrorReport(
      new Request("http://localhost/api/observability/client-errors", {
        method: "POST",
        body: JSON.stringify({
          source: "runtime",
          errorName: "TypeError",
          path: "/documents/example?secret=value",
          clientId: randomUUID(),
        }),
      }),
    );
    expect(response.status).toBe(400);
  });
});
