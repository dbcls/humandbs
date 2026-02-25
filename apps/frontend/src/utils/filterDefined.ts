type FilterDefined<T extends Record<string, unknown>> = {
  [K in keyof T as T[K] extends null | undefined ? never : K]: NonNullable<
    T[K]
  >;
};

export function filterDefined<T extends Record<string, unknown>>(
  obj: T
): FilterDefined<T> {
  const result = {} as FilterDefined<T>;

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (value !== null && value !== undefined) {
        (result as any)[key] = value;
      }
    }
  }

  return result;
}
