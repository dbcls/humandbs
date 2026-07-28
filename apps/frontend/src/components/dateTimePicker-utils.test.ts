import { expect, test } from "bun:test";

import { mergeDateTime } from "./dateTimePicker-utils";

test("stores the selected date and time in the administrator's local timezone", () => {
  const selectedDay = new Date(2026, 6, 27);

  expect(mergeDateTime(selectedDay, "15:00")).toEqual(new Date(2026, 6, 27, 15, 0));
});
