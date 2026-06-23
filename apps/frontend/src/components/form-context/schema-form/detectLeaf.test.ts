import { describe, expect, test } from "bun:test";

import { z } from "zod";

import {
  BilingualTextSchema,
  BilingualUrlValueSchema,
  PeriodOfDataUseSchema,
  UrlValueSchema,
} from "../../../../../backend/src/crawler/types/common";
import {
  BilingualTextValueRequestSchema,
  PersonRequestSchema,
  ResearchProjectRequestSchema,
  SummaryRequestSchema,
} from "../../../../../backend/src/api/types/request-schemas";
import { detectLeaf } from "./detectLeaf";

describe("detectLeaf – bilingual leaves", () => {
  test("BilingualTextValueRequestSchema → bilingual-text-value", () => {
    expect(detectLeaf(BilingualTextValueRequestSchema)).toBe("bilingual-text-value");
  });

  test("BilingualTextSchema (ja/en strings) → bilingual-text", () => {
    expect(detectLeaf(BilingualTextSchema)).toBe("bilingual-text");
  });

  test("BilingualUrlValueSchema (ja/en {text,url}) → bilingual-url-value", () => {
    expect(detectLeaf(BilingualUrlValueSchema)).toBe("bilingual-url-value");
  });

  test("summary.url ({ja,en} arrays of UrlValue) → bilingual-url-array", () => {
    const urlField = SummaryRequestSchema.shape.url;
    expect(detectLeaf(urlField)).toBe("bilingual-url-array");
  });

  test("researchProject.url (optional nullable BilingualUrlValue) → bilingual-url-value", () => {
    expect(detectLeaf(ResearchProjectRequestSchema.shape.url)).toBe("bilingual-url-value");
  });
});

describe("detectLeaf – period", () => {
  test("PeriodOfDataUseSchema → period", () => {
    expect(detectLeaf(PeriodOfDataUseSchema)).toBe("period");
  });

  test("nullable/optional period still detected", () => {
    expect(detectLeaf(PeriodOfDataUseSchema.nullable().optional())).toBe("period");
  });
});

describe("detectLeaf – non-leaves fall through to null", () => {
  test("plain string → null", () => {
    expect(detectLeaf(z.string())).toBeNull();
  });

  test("plain number → null", () => {
    expect(detectLeaf(z.number().nullable())).toBeNull();
  });

  test("string array → null", () => {
    expect(detectLeaf(z.array(z.string()))).toBeNull();
  });

  test("UrlValue object ({text,url}) on its own → null (not bilingual)", () => {
    expect(detectLeaf(UrlValueSchema)).toBeNull();
  });

  test("PersonRequestSchema (full object) → null (rendered field-by-field)", () => {
    expect(detectLeaf(PersonRequestSchema)).toBeNull();
  });

  test("organization object ({name,address}) → null", () => {
    const org = PersonRequestSchema.shape.organization;
    expect(detectLeaf(org)).toBeNull();
  });

  test("name field of Person (bilingual-text-value) → bilingual-text-value", () => {
    expect(detectLeaf(PersonRequestSchema.shape.name)).toBe("bilingual-text-value");
  });
});
