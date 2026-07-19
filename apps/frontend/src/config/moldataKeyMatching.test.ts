import { describe, expect, test } from "bun:test";

import { shouldOfferCustomMoldataKey } from "./moldataKeyMatching";

describe("shouldOfferCustomMoldataKey", () => {
  test("does not offer a custom key when an existing key exactly matches the input", () => {
    expect(shouldOfferCustomMoldataKey("Targets", new Set(), ["Targets"])).toBe(false);
  });

  test("does not offer a custom key for a differently-cased existing key", () => {
    expect(shouldOfferCustomMoldataKey("targets", new Set(), ["Targets"])).toBe(false);
  });

  test("does not offer a differently-cased duplicate of a key already in use", () => {
    expect(shouldOfferCustomMoldataKey("custom key", new Set(["Custom key"]), [])).toBe(false);
  });

  test("offers a custom key when no existing key matches", () => {
    expect(shouldOfferCustomMoldataKey("New custom key", new Set(), ["Targets"])).toBe(true);
  });
});
