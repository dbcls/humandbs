import { z } from "zod";

const localizedStringSchema = z
  .string()
  .nullable()
  .optional()
  .transform((value) => value ?? "");

export const localizedTextSchema = z.object({
  en: localizedStringSchema,
  ja: localizedStringSchema,
});

export const navigationFlowchartOptionSchema = z.object({
  id: z.string().min(1),
  title: localizedTextSchema,
  nextStep: z.string().optional(),
  linkedFlowchartId: z.string().uuid().optional(),
  link: z.string().optional(),
  linkText: localizedTextSchema.optional(),
});

export const navigationFlowchartStepSchema = z.object({
  id: z.string().min(1),
  title: localizedTextSchema,
  text: localizedTextSchema,
  options: z
    .array(navigationFlowchartOptionSchema)
    .min(2, "Each step must have at least two options"),
});

export const navigationFlowchartDataSchema = z.object({
  steps: z.array(navigationFlowchartStepSchema),
});

export const navigationFlowchartConfigSchema = navigationFlowchartDataSchema;

export function parseNavigationFlowchartConfig(value: unknown) {
  return navigationFlowchartConfigSchema.parse(value);
}
