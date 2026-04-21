import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type {
  NavigationFlowchartConfig,
  NavigationFlowchartOption,
  NavigationFlowchartStep,
} from "@/config/navigation-flowchart";
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
): { enSteps: NavigationFlowchartStep[]; jaSteps: NavigationFlowchartStep[] } {
  const transformOptions = (
    enOptions: LegacyOption[],
    jaOptions: LegacyOption[],
  ): { enOptions: NavigationFlowchartOption[]; jaOptions: NavigationFlowchartOption[] } => {
    const newEnOptions: NavigationFlowchartOption[] = [];
    const newJaOptions: NavigationFlowchartOption[] = [];

    for (let i = 0; i < enOptions.length; i++) {
      const enOpt = enOptions[i];
      const jaOpt = jaOptions[i];

      const isBeforeApplicationLink =
        enOpt.link === BEFORE_APPLICATION_LINK ||
        jaOpt?.link === BEFORE_APPLICATION_LINK;

      const enOption: NavigationFlowchartOption = {
        id: enOpt.id,
        titleEn: enOpt.title,
        titleJa: jaOpt?.title ?? enOpt.title,
        ...(enOpt.nextStep ? { nextStep: enOpt.nextStep } : {}),
        ...(isBeforeApplicationLink && beforeApplicationId
          ? { linkedFlowchartId: beforeApplicationId }
          : !isBeforeApplicationLink && enOpt.link
            ? {
                link: enOpt.link,
                linkTextEn: enOpt.linkText,
                linkTextJa: jaOpt?.linkText ?? enOpt.linkText,
              }
            : {}),
      };

      const jaOption: NavigationFlowchartOption = {
        id: enOpt.id,
        titleEn: enOpt.title,
        titleJa: jaOpt?.title ?? enOpt.title,
        ...(enOption.nextStep ? { nextStep: enOption.nextStep } : {}),
        ...(enOption.linkedFlowchartId
          ? { linkedFlowchartId: enOption.linkedFlowchartId }
          : enOption.link
            ? {
                link: enOption.link,
                linkTextEn: enOption.linkTextEn,
                linkTextJa: enOption.linkTextJa,
              }
            : {}),
      };

      newEnOptions.push(enOption);
      newJaOptions.push(jaOption);
    }

    return { enOptions: newEnOptions, jaOptions: newJaOptions };
  };

  const newEnSteps: NavigationFlowchartStep[] = [];
  const newJaSteps: NavigationFlowchartStep[] = [];

  for (let i = 0; i < enSteps.length; i++) {
    const enStep = enSteps[i];
    const jaStep = jaSteps[i];
    const { enOptions, jaOptions } = transformOptions(
      enStep.options,
      jaStep?.options ?? [],
    );

    newEnSteps.push({
      id: enStep.id,
      titleEn: enStep.title,
      titleJa: jaStep?.title ?? enStep.title,
      textEn: enStep.text,
      textJa: jaStep?.text ?? enStep.text,
      options: enOptions,
    });

    newJaSteps.push({
      id: enStep.id,
      titleEn: enStep.title,
      titleJa: jaStep?.title ?? enStep.title,
      textEn: enStep.text,
      textJa: jaStep?.text ?? enStep.text,
      options: jaOptions,
    });
  }

  return { enSteps: newEnSteps, jaSteps: newJaSteps };
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
    const { enSteps: baEnSteps, jaSteps: baJaSteps } = transformSteps(
      beforeApplicationEn.steps,
      beforeApplicationJa.steps,
      null,
    );

    // before-application is a child flowchart
    const beforeApplicationId = await upsertFlowchart(db, {
      isEntryPoint: false,
      nameEn: "Before Application",
      nameJa: "申請システムの前に",
      config: { en: { steps: baEnSteps }, ja: { steps: baJaSteps } },
    });

    // data-submission is the single entry point
    const { enSteps: dsEnSteps, jaSteps: dsJaSteps } = transformSteps(
      dataSubmissionEn.steps,
      dataSubmissionJa.steps,
      beforeApplicationId,
    );

    await upsertFlowchart(db, {
      isEntryPoint: true,
      nameEn: "Data Submission Navigation",
      nameJa: "データ登録ナビゲーション",
      config: { en: { steps: dsEnSteps }, ja: { steps: dsJaSteps } },
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
