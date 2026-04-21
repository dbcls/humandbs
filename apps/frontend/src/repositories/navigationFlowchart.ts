import { eq } from "drizzle-orm";

import type { NavigationFlowchartConfig } from "@/config/navigation-flowchart";
import { parseNavigationFlowchartConfig } from "@/config/navigation-flowchart.schema";
import { db } from "@/db/database";
import {
  navigationFlowchart,
  navigationFlowchartRevision,
  NAVIGATION_FLOWCHART_STATUS,
  type NavigationFlowchartStatus,
} from "@/db/schema";

export class NavigationFlowchartConflictError extends Error {
  constructor() {
    super("Navigation flowchart was updated by another user.");
    this.name = "NavigationFlowchartConflictError";
  }
}

export interface NavigationFlowchartRecord {
  id: string;
  slug: string;
  nameEn: string;
  nameJa: string;
  config: NavigationFlowchartConfig;
  isEntryPoint: boolean;
  status: NavigationFlowchartStatus;
  revision: number;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface NavigationFlowchartSummary {
  id: string;
  slug: string;
  nameEn: string;
  nameJa: string;
  isEntryPoint: boolean;
  status: NavigationFlowchartStatus;
  revision: number;
}

export interface NavigationFlowchartDependency {
  flowchartId: string;
  flowchartNameEn: string;
  stepId: string;
  stepTitleEn: string;
  optionId: string;
  optionTitleEn: string;
}

interface CreateParams {
  slug: string;
  nameEn: string;
  nameJa: string;
  config: NavigationFlowchartConfig;
  userId?: string;
}

interface SaveParams {
  config: NavigationFlowchartConfig;
  nameEn: string;
  nameJa: string;
  slug: string;
  isEntryPoint: boolean;
  status: NavigationFlowchartStatus;
  expectedRevision: number;
  userId?: string;
}

function parseRecord(
  row: typeof navigationFlowchart.$inferSelect,
): NavigationFlowchartRecord {
  try {
    return { ...row, config: parseNavigationFlowchartConfig(row.config) };
  } catch {
    return { ...row, config: row.config as NavigationFlowchartConfig };
  }
}

export interface NavigationFlowchartRepository {
  getAll: () => Promise<NavigationFlowchartSummary[]>;
  getById: (id: string) => Promise<NavigationFlowchartRecord | null>;
  getBySlug: (slug: string) => Promise<NavigationFlowchartRecord | null>;
  create: (params: CreateParams) => Promise<NavigationFlowchartRecord>;
  save: (id: string, params: SaveParams) => Promise<NavigationFlowchartRecord>;
  delete: (id: string) => Promise<void>;
  getDependencies: (id: string) => Promise<NavigationFlowchartDependency[]>;
}

export function createNavigationFlowchartRepository(
  database: typeof db,
): NavigationFlowchartRepository {
  return {
    async getAll() {
      const rows = await database
        .select({
          id: navigationFlowchart.id,
          slug: navigationFlowchart.slug,
          nameEn: navigationFlowchart.nameEn,
          nameJa: navigationFlowchart.nameJa,
          isEntryPoint: navigationFlowchart.isEntryPoint,
          status: navigationFlowchart.status,
          revision: navigationFlowchart.revision,
        })
        .from(navigationFlowchart)
        .orderBy(navigationFlowchart.nameEn);

      return rows;
    },

    async getById(id) {
      const row = await database.query.navigationFlowchart.findFirst({
        where: eq(navigationFlowchart.id, id),
      });
      if (!row) return null;
      return parseRecord(row);
    },

    async getBySlug(slug) {
      const row = await database.query.navigationFlowchart.findFirst({
        where: eq(navigationFlowchart.slug, slug),
      });
      if (!row) return null;
      return parseRecord(row);
    },

    async create({ slug, nameEn, nameJa, config, userId }) {
      const parsedConfig = parseNavigationFlowchartConfig(config);

      return await database.transaction(async (tx) => {
        const [created] = await tx
          .insert(navigationFlowchart)
          .values({
            slug,
            nameEn,
            nameJa,
            config: parsedConfig,
            isEntryPoint: false,
            status: NAVIGATION_FLOWCHART_STATUS.DRAFT,
            revision: 1,
            updatedBy: userId,
          })
          .returning();

        await tx.insert(navigationFlowchartRevision).values({
          flowchartId: created.id,
          config: parsedConfig,
          revision: created.revision,
          createdBy: userId,
        });

        return { ...created, config: parsedConfig };
      });
    },

    async save(id, { config, nameEn, nameJa, slug, isEntryPoint, status, expectedRevision, userId }) {
      const parsedConfig = parseNavigationFlowchartConfig(config);
      const current = await this.getById(id);

      if (!current) {
        throw new Error(`Navigation flowchart not found: ${id}`);
      }

      if (current.revision !== expectedRevision) {
        throw new NavigationFlowchartConflictError();
      }

      return await database.transaction(async (tx) => {
        const [updated] = await tx
          .update(navigationFlowchart)
          .set({
            config: parsedConfig,
            nameEn,
            nameJa,
            slug,
            isEntryPoint,
            status,
            revision: current.revision + 1,
            updatedAt: new Date(),
            updatedBy: userId,
          })
          .where(eq(navigationFlowchart.id, id))
          .returning();

        await tx.insert(navigationFlowchartRevision).values({
          flowchartId: updated.id,
          config: parsedConfig,
          revision: updated.revision,
          createdBy: userId,
        });

        return { ...updated, config: parsedConfig };
      });
    },

    async delete(id) {
      await database
        .delete(navigationFlowchart)
        .where(eq(navigationFlowchart.id, id));
    },

    async getDependencies(id) {
      const all = await database.query.navigationFlowchart.findMany({
        where: (f, { ne }) => ne(f.id, id),
      });

      const deps: NavigationFlowchartDependency[] = [];

      for (const row of all) {
        const config = row.config as NavigationFlowchartConfig;
        for (const step of config.en.steps) {
          for (const option of step.options) {
            if (option.linkedFlowchartId === id) {
              deps.push({
                flowchartId: row.id,
                flowchartNameEn: row.nameEn,
                stepId: step.id,
                stepTitleEn: step.titleEn,
                optionId: option.id,
                optionTitleEn: option.titleEn,
              });
            }
          }
        }
      }

      return deps;
    },
  };
}

export const navigationFlowchartRepository =
  createNavigationFlowchartRepository(db);
