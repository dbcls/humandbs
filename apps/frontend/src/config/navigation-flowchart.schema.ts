import { z } from "zod";

export const navigationFlowchartOptionSchema = z.object({
  id: z.string().min(1),
  titleEn: z.string().min(1),
  titleJa: z.string().min(1),
  nextStep: z.string().optional(),
  linkedFlowchartId: z.string().uuid().optional(),
  link: z.string().optional(),
  linkTextEn: z.string().optional(),
  linkTextJa: z.string().optional(),
});

export const navigationFlowchartStepSchema = z.object({
  id: z.string().min(1),
  titleEn: z.string().min(1),
  titleJa: z.string().min(1),
  textEn: z.string(),
  textJa: z.string(),
  options: z
    .array(navigationFlowchartOptionSchema)
    .min(2, "Each step must have at least two options"),
});

export const navigationFlowchartDataSchema = z.object({
  steps: z.array(navigationFlowchartStepSchema),
});

export const navigationFlowchartConfigSchema = z.object({
  en: navigationFlowchartDataSchema,
  ja: navigationFlowchartDataSchema,
});

export function parseNavigationFlowchartConfig(value: unknown) {
  return navigationFlowchartConfigSchema.parse(value);
}
