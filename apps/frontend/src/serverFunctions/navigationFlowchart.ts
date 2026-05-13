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
): NavigationFlowchartData {
  const steps: NavigationFlowchartStep[] = legacy.steps.map((s) => ({
    id: s.id,
    title: { en: s.title, ja: s.title },
    text: { en: s.text, ja: s.text },
    options: s.options.map(
      (o): NavigationFlowchartOption => ({
        id: o.id,
        title: { en: o.title, ja: o.title },
        ...(o.nextStep ? { nextStep: o.nextStep } : {}),
        ...(o.link && o.link !== "before-application"
          ? {
              link: o.link,
              ...(o.linkText
                ? { linkText: { en: o.linkText, ja: o.linkText } }
                : {}),
            }
          : {}),
      }),
    ),
  }));
  return { steps };
}

async function getFallbackEntryPoint(
  locale: Locale,
): Promise<NavigationFlowchartData | null> {
  try {
    const file = Bun.file(
      `./src/config/navigation/data-submission-${locale}.json`,
    );
    const legacy = (await file.json()) as LegacyNavigationData;
    return legacyToFlowchartData(legacy);
  } catch {
    return null;
  }
}

export interface NavigationFlowchartResponse {
  id: string;
  isEntryPoint: boolean;
  nameEn: string;
  nameJa: string;
  data: NavigationFlowchartData;
}

/** Fetches the single entry-point flowchart (isEntryPoint = true), with JSON fallback. */
export const $getNavigationEntryPoint = createServerFn({ method: "GET" })
  .inputValidator(z.object({ locale: localeSchema }))
  .handler(
    async ({
      data: { locale },
    }): Promise<NavigationFlowchartResponse | null> => {
      try {
        const record = await navigationFlowchartRepository.getEntryPoint();
        if (record) {
          return {
            id: record.id,
            isEntryPoint: true,
            nameEn: record.nameEn,
            nameJa: record.nameJa,
            data: record.config,
          };
        }
      } catch (error) {
        console.error(
          "Failed to load entry point flowchart from DB, using fallback.",
          error,
        );
      }

      const fallback = await getFallbackEntryPoint(locale);
      if (!fallback) return null;

      return {
        id: "entry-point",
        isEntryPoint: true,
        nameEn: "Data Submission Navigation",
        nameJa: "データ登録ナビゲーション",
        data: fallback,
      };
    },
  );

export const $getNavigationFlowchartById = createServerFn({ method: "GET" })
  .inputValidator(z.object({ id: z.string(), locale: localeSchema }))
  .handler(
    async ({
      data: { id, locale },
    }): Promise<NavigationFlowchartResponse | null> => {
      try {
        const record = await navigationFlowchartRepository.getById(id);
        if (record && record.status === "published") {
          return {
            id: record.id,
            isEntryPoint: record.isEntryPoint,
            nameEn: record.nameEn,
            nameJa: record.nameJa,
            data: record.config,
          };
        }
      } catch (error) {
        console.error("Failed to load flowchart by id from DB.", error);
      }
      return null;
    },
  );

export const $getNavigationFlowchartNames = createServerFn({ method: "GET" })
  .inputValidator(z.object({ ids: z.array(z.string()) }))
  .handler(
    async ({
      data: { ids },
    }): Promise<Record<string, { nameEn: string; nameJa: string }>> => {
      const result: Record<string, { nameEn: string; nameJa: string }> = {};
      for (const id of ids) {
        try {
          const record = await navigationFlowchartRepository.getById(id);
          if (record)
            result[id] = { nameEn: record.nameEn, nameJa: record.nameJa };
        } catch {
          // skip
        }
      }
      return result;
    },
  );

export function getNavigationFlowchartNamesQueryOptions(ids: string[]) {
  return queryOptions({
    queryKey: ["navigation-flowchart", "names", ids.slice().sort().join(",")],
    queryFn: () => $getNavigationFlowchartNames({ data: { ids } }),
    staleTime: 1000 * 60 * 5,
    enabled: ids.length > 0,
  });
}

export function getNavigationEntryPointQueryOptions(locale: Locale) {
  return queryOptions({
    queryKey: ["navigation-flowchart", "entry-point", locale],
    queryFn: () => $getNavigationEntryPoint({ data: { locale } }),
    staleTime: 1000 * 60 * 5,
  });
}

export function getNavigationFlowchartByIdQueryOptions(
  id: string,
  locale: Locale,
) {
  return queryOptions({
    queryKey: ["navigation-flowchart", "id", id, locale],
    queryFn: () => $getNavigationFlowchartById({ data: { id, locale } }),
    staleTime: 1000 * 60 * 5,
  });
}
