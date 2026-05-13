import { and, desc, eq, ne } from "drizzle-orm";

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
  isEntryPoint: boolean;
  nameEn: string;
  nameJa: string;
  config: NavigationFlowchartConfig;
  status: NavigationFlowchartStatus;
  revision: number;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface NavigationFlowchartSummary {
  id: string;
  isEntryPoint: boolean;
  nameEn: string;
  nameJa: string;
  status: NavigationFlowchartStatus;
  revision: number;
  linkedFlowchartIds: string[];
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
  isEntryPoint: boolean;
  nameEn: string;
  nameJa: string;
  config: NavigationFlowchartConfig;
  userId?: string;
}

interface SaveParams {
  config: NavigationFlowchartConfig;
  nameEn: string;
  nameJa: string;
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
  getEntryPoint: () => Promise<NavigationFlowchartRecord | null>;
  getById: (id: string) => Promise<NavigationFlowchartRecord | null>;
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
          isEntryPoint: navigationFlowchart.isEntryPoint,
          nameEn: navigationFlowchart.nameEn,
          nameJa: navigationFlowchart.nameJa,
          status: navigationFlowchart.status,
          revision: navigationFlowchart.revision,
          config: navigationFlowchart.config,
        })
        .from(navigationFlowchart)
        .orderBy(
          desc(navigationFlowchart.isEntryPoint),
          navigationFlowchart.nameEn,
        );

      return rows.map((row) => {
        const config = row.config as NavigationFlowchartConfig;
        const linkedFlowchartIds = [
          ...new Set(
            config.steps
              .flatMap((s) => s.options)
              .map((o) => o.linkedFlowchartId)
              .filter((id): id is string => !!id),
          ),
        ];
        const { config: _config, ...summary } = row;
        void _config;
        return { ...summary, linkedFlowchartIds };
      });
    },

    async getEntryPoint() {
      const row = await database.query.navigationFlowchart.findFirst({
        where: and(
          eq(navigationFlowchart.isEntryPoint, true),
          eq(navigationFlowchart.status, NAVIGATION_FLOWCHART_STATUS.PUBLISHED),
        ),
      });
      if (!row) return null;
      return parseRecord(row);
    },

    async getById(id) {
      const row = await database.query.navigationFlowchart.findFirst({
        where: eq(navigationFlowchart.id, id),
      });
      if (!row) return null;
      return parseRecord(row);
    },

    async create({ isEntryPoint, nameEn, nameJa, config, userId }) {
      const parsedConfig = parseNavigationFlowchartConfig(config);

      return await database.transaction(async (tx) => {
        const [created] = await tx
          .insert(navigationFlowchart)
          .values({
            isEntryPoint,
            nameEn,
            nameJa,
            config: parsedConfig,
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

    async save(
      id,
      {
        config,
        nameEn,
        nameJa,
        isEntryPoint,
        status,
        expectedRevision,
        userId,
      },
    ) {
      const parsedConfig = parseNavigationFlowchartConfig(config);
      const current = await this.getById(id);

      if (!current) {
        throw new Error(`Navigation flowchart not found: ${id}`);
      }

      if (current.revision !== expectedRevision) {
        throw new NavigationFlowchartConflictError();
      }

      return await database.transaction(async (tx) => {
        // If promoting this flowchart to entry point, demote any other entry point first.
        if (isEntryPoint) {
          await tx
            .update(navigationFlowchart)
            .set({ isEntryPoint: false })
            .where(
              and(
                eq(navigationFlowchart.isEntryPoint, true),
                ne(navigationFlowchart.id, id),
              ),
            );
        }

        const [updated] = await tx
          .update(navigationFlowchart)
          .set({
            config: parsedConfig,
            nameEn,
            nameJa,
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
        for (const step of config.steps) {
          for (const option of step.options) {
            if (option.linkedFlowchartId === id) {
              deps.push({
                flowchartId: row.id,
                flowchartNameEn: row.nameEn,
                stepId: step.id,
                stepTitleEn: step.title.en,
                optionId: option.id,
                optionTitleEn: option.title.en,
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
