export const cleanEmptyParams = <T extends Record<string, any>>(search: T): T => {
  const newSearch = {} as Record<string, any>;
  Object.keys(search).forEach((key) => {
    const value = search[key];
    if (value !== undefined && value !== "" && !(typeof value === "number" && isNaN(value))) {
      newSearch[key] = value;
    }
  });

  return newSearch as T;
};
