import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type {
  NavigationFlowchartConfig,
  NavigationFlowchartOption,
  NavigationFlowchartStep,
} from "@/config/navigationFlowchart";
import * as schema from "@/db/schema";
import { NAVIGATION_FLOWCHART_STATUS } from "@/db/schema";

import { buildDatabaseUrl } from "./utils";

// Legacy option shape from static JSON files
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

// The "before-application" link value used in the legacy data-submission JSON
const BEFORE_APPLICATION_LINK = "before-application";

function transformSteps(
  enSteps: LegacyStep[],
  jaSteps: LegacyStep[],
  beforeApplicationId: string | null,
): NavigationFlowchartStep[] {
  const transformOptions = (
    enOptions: LegacyOption[],
    jaOptions: LegacyOption[],
  ): NavigationFlowchartOption[] => {
    const newOptions: NavigationFlowchartOption[] = [];

    for (let i = 0; i < enOptions.length; i++) {
      const enOpt = enOptions[i];
      const jaOpt = jaOptions[i];

      const isBeforeApplicationLink =
        enOpt.link === BEFORE_APPLICATION_LINK || jaOpt?.link === BEFORE_APPLICATION_LINK;

      const option: NavigationFlowchartOption = {
        id: enOpt.id,
        title: { en: enOpt.title, ja: jaOpt?.title ?? enOpt.title },
        ...(enOpt.nextStep ? { nextStep: enOpt.nextStep } : {}),
        ...(isBeforeApplicationLink && beforeApplicationId
          ? { linkedFlowchartId: beforeApplicationId }
          : !isBeforeApplicationLink && enOpt.link
            ? {
                link: enOpt.link,
                ...(enOpt.linkText || jaOpt?.linkText
                  ? {
                      linkText: {
                        en: enOpt.linkText ?? "",
                        ja: jaOpt?.linkText ?? enOpt.linkText ?? "",
                      },
                    }
                  : {}),
              }
            : {}),
      };

      newOptions.push(option);
    }

    return newOptions;
  };

  const newSteps: NavigationFlowchartStep[] = [];

  for (let i = 0; i < enSteps.length; i++) {
    const enStep = enSteps[i];
    const jaStep = jaSteps[i];
    const options = transformOptions(enStep.options, jaStep?.options ?? []);

    newSteps.push({
      id: enStep.id,
      title: { en: enStep.title, ja: jaStep?.title ?? enStep.title },
      text: { en: enStep.text, ja: jaStep?.text ?? enStep.text },
      options,
    });
  }

  return newSteps;
}

async function upsertFlowchart(
  db: ReturnType<typeof drizzle<typeof schema>>,
  params: {
    isEntryPoint: boolean;
    nameEn: string;
    nameJa: string;
    config: NavigationFlowchartConfig;
  },
): Promise<string> {
  const existing = await db.query.navigationFlowchart.findFirst({
    where: eq(schema.navigationFlowchart.nameEn, params.nameEn),
  });

  if (existing) {
    console.log(`  Skipping "${params.nameEn}" — already exists.`);
    return existing.id;
  }

  const [created] = await db
    .insert(schema.navigationFlowchart)
    .values({
      isEntryPoint: params.isEntryPoint,
      nameEn: params.nameEn,
      nameJa: params.nameJa,
      config: params.config,
      status: NAVIGATION_FLOWCHART_STATUS.PUBLISHED,
      revision: 1,
    })
    .returning();

  await db.insert(schema.navigationFlowchartRevision).values({
    flowchartId: created.id,
    config: params.config,
    revision: created.revision,
    createdBy: null,
  });

  console.log(`  Inserted "${params.nameEn}" (id: ${created.id}).`);
  return created.id;
}

async function seedNavigationFlowcharts() {
  const pool = new Pool({ connectionString: buildDatabaseUrl() });
  const db = drizzle(pool, { schema });

  try {
    console.log("Seeding navigation flowcharts...");

    // Load legacy JSON files
    const dataSubmissionEn = (await Bun.file(
      "./src/config/navigation/data-submission-en.json",
    ).json()) as LegacyNavigationData;

    const dataSubmissionJa = (await Bun.file(
      "./src/config/navigation/data-submission-ja.json",
    ).json()) as LegacyNavigationData;

    const beforeApplicationEn = (await Bun.file(
      "./src/config/navigation/before-application-en.json",
    ).json()) as LegacyNavigationData;

    const beforeApplicationJa = (await Bun.file(
      "./src/config/navigation/before-application-ja.json",
    ).json()) as LegacyNavigationData;

    // Seed before-application first (no cross-flowchart links)
    const baSteps = transformSteps(beforeApplicationEn.steps, beforeApplicationJa.steps, null);

    // before-application is a linked flowchart
    const beforeApplicationId = await upsertFlowchart(db, {
      isEntryPoint: false,
      nameEn: "Before Application",
      nameJa: "申請システムの前に",
      config: { steps: baSteps },
    });

    // data-submission is the single entry point
    const dsSteps = transformSteps(
      dataSubmissionEn.steps,
      dataSubmissionJa.steps,
      beforeApplicationId,
    );

    await upsertFlowchart(db, {
      isEntryPoint: true,
      nameEn: "Data Submission Navigation",
      nameJa: "データ登録ナビゲーション",
      config: { steps: dsSteps },
    });

    console.log("Done.");
  } finally {
    await pool.end();
  }
}

seedNavigationFlowcharts().catch((error) => {
  console.error("Failed to seed navigation flowcharts.");
  console.error(error);
  process.exit(1);
});
