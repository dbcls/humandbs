import MOL_DATA_KEYS from "./moldataKeys.json";

const keyPositions = new Map(MOL_DATA_KEYS.map((key, index) => [key, index]));
const customKeyPosition = MOL_DATA_KEYS.length;

/**
 * Orders predefined moldata keys according to `moldataKeys.json`.
 * Custom keys sort after predefined keys; equal positions retain their source order.
 */
export function compareMoldataKeys(left: string, right: string) {
  const leftPosition = keyPositions.get(left) ?? customKeyPosition;
  const rightPosition = keyPositions.get(right) ?? customKeyPosition;
  return leftPosition - rightPosition;
}
