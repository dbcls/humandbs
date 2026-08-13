export const cleanEmptyParams = <T extends Record<string, any>>(search: T): T => {
  const newSearch = {} as Record<string, any>;
  const keys = Object.keys(search).sort();
  for (const key of keys) {
    const value = search[key];
    if (value !== undefined && value !== "" && !(typeof value === "number" && isNaN(value))) {
      newSearch[key] = value;
    }
  }
  return newSearch as T;
};
