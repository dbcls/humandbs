/**
 * DateTimePicker helpers that keep the admin's displayed wall-clock time intact.
 * They use local Date accessors because scheduled news is entered in local time.
 * The resulting Date still serializes as an absolute instant for `timestamptz` storage.
 */
export function toTimeString(date: Date): string {
  const h = `${date.getHours()}`.padStart(2, "0");
  const m = `${date.getMinutes()}`.padStart(2, "0");
  return `${h}:${m}`;
}

export function formatDisplay(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  const dd = `${date.getDate()}`.padStart(2, "0");
  const h = `${date.getHours()}`.padStart(2, "0");
  const min = `${date.getMinutes()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${h}:${min}`;
}

export function calendarSelected(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function mergeDateTime(calendarDay: Date, timeStr: string): Date {
  const [h, m] = timeStr.split(":").map(Number);
  return new Date(
    calendarDay.getFullYear(),
    calendarDay.getMonth(),
    calendarDay.getDate(),
    h ?? 0,
    m ?? 0,
  );
}
