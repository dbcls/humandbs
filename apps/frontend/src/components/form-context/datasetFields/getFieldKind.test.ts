import { describe, expect, test } from "bun:test";
import { z } from "zod";

import {
  DiseaseInfoSchema,
  SubjectCountTypeSchema,
  VariantCountsSchema,
} from "../../../../../backend/src/crawler/types/structured";
import { getFieldKind } from "./getFieldKind";

describe("getFieldKind – scalars", () => {
  test("nullable number → { kind: 'number' }", () => {
    expect(getFieldKind(z.number().nullable())).toEqual({ kind: "number" });
  });

  test("nullable boolean → { kind: 'boolean' }", () => {
    expect(getFieldKind(z.boolean().nullable())).toEqual({ kind: "boolean" });
  });

  test("nullable string → { kind: 'string' }", () => {
    expect(getFieldKind(z.string().nullable())).toEqual({ kind: "string" });
  });

  test("nullable enum → { kind: 'enum', options }", () => {
    expect(getFieldKind(SubjectCountTypeSchema.nullable())).toEqual({
      kind: "enum",
      options: ["individual", "sample", "mixed"],
    });
  });
});

describe("getFieldKind – arrays", () => {
  test("array of string → { kind: 'array', itemKind: { kind: 'string' } }", () => {
    expect(getFieldKind(z.array(z.string()))).toEqual({
      kind: "array",
      itemKind: { kind: "string" },
    });
  });

  test("array of nullable number → itemKind is number", () => {
    expect(getFieldKind(z.array(z.number().nullable()))).toEqual({
      kind: "array",
      itemKind: { kind: "number" },
    });
  });

  test("array of DiseaseInfoSchema (ZodObject) → itemKind is object with shape", () => {
    const result = getFieldKind(z.array(DiseaseInfoSchema));
    expect(result.kind).toBe("array");
    if (result.kind === "array") {
      expect(result.itemKind.kind).toBe("object");
      if (result.itemKind.kind === "object") {
        expect(result.itemKind.shape.label).toEqual({ kind: "string" });
        expect(result.itemKind.shape.icd10).toEqual({ kind: "string" });
      }
    }
  });
});

describe("getFieldKind – objects", () => {
  test("VariantCountsSchema → { kind: 'object', shape with nullable numbers }", () => {
    const result = getFieldKind(VariantCountsSchema);
    expect(result.kind).toBe("object");
    if (result.kind === "object") {
      expect(result.shape.snv).toEqual({ kind: "number" });
      expect(result.shape.indel).toEqual({ kind: "number" });
      expect(result.shape.cnv).toEqual({ kind: "number" });
      expect(result.shape.sv).toEqual({ kind: "number" });
      expect(result.shape.total).toEqual({ kind: "number" });
    }
  });
});

describe("getFieldKind – unknown / edge cases", () => {
  test("unknown type (z.date()) → { kind: 'unknown' }", () => {
    expect(getFieldKind(z.date())).toEqual({ kind: "unknown" });
  });

  test("doubly-wrapped nullable().optional() unwraps to scalar", () => {
    expect(getFieldKind(z.string().nullable().optional())).toEqual({ kind: "string" });
  });
});
