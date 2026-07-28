import { expect, test } from "bun:test";

import { toDateStringInTimeZone, toLocaleDateTimeString } from "./dates";

test("uses the configured timezone when deriving a date-only value", () => {
  const utcInstant = new Date("2026-07-26T15:00:00Z");

  expect(toDateStringInTimeZone(utcInstant, "Asia/Tokyo")).toBe("2026-07-27");
});

test("formats date-time values in the local timezone", () => {
  const utcInstant = new Date("2026-07-27T15:00:00Z");

  expect(toLocaleDateTimeString(utcInstant)).toBe("2026-07-28 00:00");
});
