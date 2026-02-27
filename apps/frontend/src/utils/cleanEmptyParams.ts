export const cleanEmptyParams = <T extends Record<string, any>>(
  search: T,
): T => {
  const newSearch = Object.assign({}, search);
  Object.keys(newSearch).forEach((key) => {
    const value = newSearch[key];
    if (
      value === undefined ||
      value === "" ||
      (typeof value === "number" && isNaN(value))
    )
      delete newSearch[key];
  });

  return newSearch;
};
