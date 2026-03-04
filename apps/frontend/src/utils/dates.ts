export interface DateStringRange {
  from: string | undefined;
  to?: string | undefined;
}

export interface DateRange {
  from: Date | undefined;
  to?: Date | undefined;
}

export function toDateString(date: Date | undefined): string | undefined {
  if (!date) return undefined;

  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${date.getFullYear()}/${month}/${day}`;
}

export function toDate(
  dateString: string | undefined | null,
): Date | undefined {
  if (!dateString) return undefined;
  return new Date(dateString);
}

export function toDateStringRange(
  dateRange: DateRange | undefined,
): DateStringRange | undefined {
  if (!dateRange) return undefined;

  const result = {} as DateStringRange;

  result.from = toDateString(dateRange.from);

  if ("to" in dateRange) {
    result.to = toDateString(dateRange.to);
  }

  return result;
}

export function toDateRange(
  dateStrRange: DateStringRange | undefined,
): DateRange | undefined {
  if (!dateStrRange) return undefined;

  const result = {} as DateRange;

  result.from = toDate(dateStrRange.from);

  if ("to" in dateStrRange) {
    result.to = toDate(dateStrRange.to);
  }

  return result;
}
