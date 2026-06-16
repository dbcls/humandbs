import { eq } from "drizzle-orm";

import type { SiteNavigationConfig } from "@/config/site-navigation";
import { getDefaultSiteNavigationConfig } from "@/config/site-navigation";
import { parseSiteNavigationConfig } from "@/config/site-navigation.schema";
import type { DB } from "@/db/database";
import { db } from "@/db/database";
import { siteNavigationConfig, siteNavigationConfigRevision } from "@/db/schema";

const GLOBAL_SITE_NAVIGATION_CONFIG_ID = "global";

export class SiteNavigationConfigConflictError extends Error {
  constructor() {
    super("Site navigation config was updated by another user.");
    this.name = "SiteNavigationConfigConflictError";
  }
}

export interface SiteNavigationConfigRecord {
  id: string;
  config: SiteNavigationConfig;
  revision: number;
  updatedAt: Date;
  updatedBy: string | null;
}

interface SiteNavigationRepository {
  getActive: () => Promise<SiteNavigationConfigRecord | null>;
  getEffective: () => Promise<SiteNavigationConfigRecord>;
  save: (
    nextConfig: SiteNavigationConfig,
    options: {
      expectedRevision: number;
      userId?: string;
    },
  ) => Promise<SiteNavigationConfigRecord>;
  resetToDefault: (options: {
    expectedRevision: number;
    userId?: string;
  }) => Promise<SiteNavigationConfigRecord>;
}

export function createSiteNavigationRepository(database: DB): SiteNavigationRepository {
  return {
    async getActive() {
      const row = await database.query.siteNavigationConfig.findFirst({
        where: eq(siteNavigationConfig.id, GLOBAL_SITE_NAVIGATION_CONFIG_ID),
      });

      if (!row) return null;

      try {
        return {
          ...row,
          config: parseSiteNavigationConfig(row.config),
        };
      } catch (error) {
        // Config in DB is in an unrecognized shape (e.g. pre-migration).
        // Fall back to the current default config but preserve row identity and
        // revision so the next save overwrites the existing record instead of
        // trying to insert a second "global" row.
        console.error(
          "Stored site navigation config failed validation — falling back to the default config for this row.",
          error,
        );
        return {
          ...row,
          config: getDefaultSiteNavigationConfig(),
        };
      }
    },

    async getEffective() {
      const active = await this.getActive();

      if (active) return active;

      return {
        id: GLOBAL_SITE_NAVIGATION_CONFIG_ID,
        config: getDefaultSiteNavigationConfig(),
        revision: 1,
        updatedAt: new Date(0),
        updatedBy: null,
      };
    },

    async save(nextConfig, { expectedRevision, userId }) {
      const parsedConfig = parseSiteNavigationConfig(nextConfig);
      const current = await this.getActive();

      if (!current) {
        if (expectedRevision !== 1) {
          throw new SiteNavigationConfigConflictError();
        }

        const [created] = await database
          .insert(siteNavigationConfig)
          .values({
            id: GLOBAL_SITE_NAVIGATION_CONFIG_ID,
            config: parsedConfig,
            revision: 1,
            updatedBy: userId,
          })
          .returning();

        await database.insert(siteNavigationConfigRevision).values({
          configId: created.id,
          config: parsedConfig,
          revision: created.revision,
          createdBy: userId,
        });

        return {
          ...created,
          config: parsedConfig,
        };
      }

      if (current.revision !== expectedRevision) {
        throw new SiteNavigationConfigConflictError();
      }

      const [updated] = await database
        .update(siteNavigationConfig)
        .set({
          config: parsedConfig,
          revision: current.revision + 1,
          updatedAt: new Date(),
          updatedBy: userId,
        })
        .where(eq(siteNavigationConfig.id, GLOBAL_SITE_NAVIGATION_CONFIG_ID))
        .returning();

      await database.insert(siteNavigationConfigRevision).values({
        configId: updated.id,
        config: parsedConfig,
        revision: updated.revision,
        createdBy: userId,
      });

      return {
        ...updated,
        config: parsedConfig,
      };
    },

    async resetToDefault({ expectedRevision, userId }) {
      return this.save(getDefaultSiteNavigationConfig(), {
        expectedRevision,
        userId,
      });
    },
  };
}

export const siteNavigationRepository = createSiteNavigationRepository(db);
