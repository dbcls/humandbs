import { expect, test } from "bun:test";

import { toDateStringInTimeZone } from "./dates";

test("uses the configured timezone when deriving a date-only value", () => {
  const utcInstant = new Date("2026-07-26T15:00:00Z");

  expect(toDateStringInTimeZone(utcInstant, "Asia/Tokyo")).toBe("2026-07-27");
});
