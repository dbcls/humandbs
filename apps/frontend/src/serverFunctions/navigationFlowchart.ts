import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { localeSchema, type Locale } from "@/config/i18n";
import type {
  NavigationFlowchartData,
  NavigationFlowchartOption,
  NavigationFlowchartStep,
} from "@/config/navigation-flowchart";
import { navigationFlowchartRepository } from "@/repositories/navigationFlowchart";

// Legacy JSON shape (static fallback files)
interface LegacyOption {
  id: string;
  title: string;
  nextStep?: string;
  link?: string;
  linkText?: string;
}
interface LegacyStep {
  id: string;
  title: string;
  text: string;
  options: LegacyOption[];
}
interface LegacyNavigationData {
  steps: LegacyStep[];
}

function legacyToFlowchartData(
  legacy: LegacyNavigationData,
  locale: Locale,
): NavigationFlowchartData {
  const steps: NavigationFlowchartStep[] = legacy.steps.map((s) => ({
    id: s.id,
    titleEn: s.title,
    titleJa: s.title,
    textEn: s.text,
    textJa: s.text,
    options: s.options.map(
      (o): NavigationFlowchartOption => ({
        id: o.id,
        titleEn: o.title,
        titleJa: o.title,
        ...(o.nextStep ? { nextStep: o.nextStep } : {}),
        ...(o.link && o.link !== "before-application"
          ? { link: o.link, linkTextEn: o.linkText, linkTextJa: o.linkText }
          : {}),
      }),
    ),
  }));
  // suppress unused locale in fallback path
  void locale;
  return { steps };
}

async function getFallbackData(
  slug: string,
  locale: Locale,
): Promise<NavigationFlowchartData | null> {
  try {
    const typeMap: Record<string, string> = {
      "/data-submission/navigation": "data-submission",
      "/data-submission/navigation/before-application": "before-application",
    };
    const type = typeMap[slug];
    if (!type) return null;
    const file = Bun.file(`./src/config/navigation/${type}-${locale}.json`);
    const legacy = (await file.json()) as LegacyNavigationData;
    return legacyToFlowchartData(legacy, locale);
  } catch {
    return null;
  }
}

export interface NavigationFlowchartResponse {
  id: string;
  slug: string | null;
  nameEn: string;
  nameJa: string;
  data: NavigationFlowchartData;
}

export const $getNavigationFlowchartBySlug = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string(), locale: localeSchema }))
  .handler(async ({ data: { slug, locale } }): Promise<NavigationFlowchartResponse | null> => {
    try {
      const record = await navigationFlowchartRepository.getBySlug(slug);
      if (record) {
        return {
          id: record.id,
          slug: record.slug,
          nameEn: record.nameEn,
          nameJa: record.nameJa,
          data: locale === "ja" ? record.config.ja : record.config.en,
        };
      }
    } catch (error) {
      console.error("Failed to load flowchart from DB, using fallback.", error);
    }

    const fallback = await getFallbackData(slug, locale);
    if (!fallback) return null;

    return { id: slug, slug, nameEn: slug, nameJa: slug, data: fallback };
  });

export const $getNavigationFlowchartById = createServerFn({ method: "GET" })
  .inputValidator(z.object({ id: z.string(), locale: localeSchema }))
  .handler(async ({ data: { id, locale } }): Promise<NavigationFlowchartResponse | null> => {
    try {
      const record = await navigationFlowchartRepository.getById(id);
      if (record) {
        return {
          id: record.id,
          slug: record.slug,
          nameEn: record.nameEn,
          nameJa: record.nameJa,
          data: locale === "ja" ? record.config.ja : record.config.en,
        };
      }
    } catch (error) {
      console.error("Failed to load flowchart by id from DB.", error);
    }
    return null;
  });

export const $getNavigationFlowchartNames = createServerFn({ method: "GET" })
  .inputValidator(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ data: { ids } }): Promise<Record<string, { nameEn: string; nameJa: string }>> => {
    const result: Record<string, { nameEn: string; nameJa: string }> = {};
    for (const id of ids) {
      try {
        const record = await navigationFlowchartRepository.getById(id);
        if (record) result[id] = { nameEn: record.nameEn, nameJa: record.nameJa };
      } catch {
        // skip
      }
    }
    return result;
  });

export function getNavigationFlowchartNamesQueryOptions(ids: string[]) {
  return queryOptions({
    queryKey: ["navigation-flowchart", "names", ids.slice().sort().join(",")],
    queryFn: () => $getNavigationFlowchartNames({ data: { ids } }),
    staleTime: 1000 * 60 * 5,
    enabled: ids.length > 0,
  });
}

export function getNavigationFlowchartQueryOptions(slug: string, locale: Locale) {
  return queryOptions({
    queryKey: ["navigation-flowchart", "slug", slug, locale],
    queryFn: () => $getNavigationFlowchartBySlug({ data: { slug, locale } }),
    staleTime: 1000 * 60 * 5,
  });
}

export function getNavigationFlowchartByIdQueryOptions(id: string, locale: Locale) {
  return queryOptions({
    queryKey: ["navigation-flowchart", "id", id, locale],
    queryFn: () => $getNavigationFlowchartById({ data: { id, locale } }),
    staleTime: 1000 * 60 * 5,
  });
}
