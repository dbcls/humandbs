/**
 * Common type definitions and constants
 *
 * This module provides:
 * - Language types and constants
 * - Common Zod preprocessing helpers
 */
import { z } from "zod";
export declare const LANG_TYPES: readonly ["ja", "en"];
export type LangType = (typeof LANG_TYPES)[number];
export declare const booleanFromString: z.ZodPipe<z.ZodTransform<boolean | undefined, unknown>, z.ZodOptional<z.ZodBoolean>>;
//# sourceMappingURL=common.d.ts.map