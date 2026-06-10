export interface DateStringRange {
  from: string | undefined;
  to?: string | undefined;
}

export function toLocaleDateTimeString(date: Date | string | undefined | null): string | undefined {
  if (!date) return undefined;
  const d = typeof date === "string" ? new Date(date) : date;
  const yyyy = d.getUTCFullYear();
  const mm = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getUTCDate()}`.padStart(2, "0");
  const h = `${d.getUTCHours()}`.padStart(2, "0");
  const min = `${d.getUTCMinutes()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${h}:${min}`;
}

export interface DateRange {
  from: Date | undefined;
  to?: Date | undefined;
}

export function toDateString(date: Date | string | undefined): string | undefined {
  if (!date) return undefined;

  if (typeof date === "string") {
    date = new Date(date);
  }

  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

export function toDate(dateString: string | undefined | null): Date | undefined {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function toDateStringRange(dateRange: DateRange | undefined): DateStringRange | undefined {
  if (!dateRange) return undefined;

  const result = {} as DateStringRange;

  result.from = toDateString(dateRange.from);

  if ("to" in dateRange) {
    result.to = toDateString(dateRange.to);
  }

  return result;
}

export function toDateRange(dateStrRange: DateStringRange | undefined): DateRange | undefined {
  if (!dateStrRange) return undefined;

  const result = {} as DateRange;

  result.from = toDate(dateStrRange.from);

  if ("to" in dateStrRange) {
    result.to = toDate(dateStrRange.to);
  }

  return result;
}
