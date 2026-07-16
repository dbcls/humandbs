import { asc, desc, eq, sql } from "drizzle-orm";

import defaultPairsJson from "@/config/moldataKeyCatalog.defaults.json";
import type { DB } from "@/db/database";
import { db } from "@/db/database";
import { moldataKeyCatalog, moldataKeyCatalogEntry } from "@/db/schema";

const GLOBAL_MOLDATA_KEY_CATALOG_ID = "global";

export type MoldataKeyCatalogEntry = {
  id: string;
  english: string;
  japanese: string;
  position: number;
};

export type MoldataKeyCatalog = {
  revision: number;
  entries: MoldataKeyCatalogEntry[];
};

export class MoldataKeyCatalogConflictError extends Error {
  constructor() {
    super("Moldata key catalog was updated by another user.");
    this.name = "MoldataKeyCatalogConflictError";
  }
}

export class MoldataKeyCatalogDuplicateKeyError extends Error {
  constructor() {
    super("A moldata key with this English value already exists.");
    this.name = "MoldataKeyCatalogDuplicateKeyError";
  }
}

export class MoldataKeyCatalogValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoldataKeyCatalogValidationError";
  }
}

const defaultPairs = defaultPairsJson as [string, string][];

export interface MoldataKeyCatalogRepository {
  get: () => Promise<MoldataKeyCatalog>;
  initializeDefaults: () => Promise<{ created: boolean; catalog: MoldataKeyCatalog }>;
  create: (params: {
    english: string;
    japanese: string;
    expectedRevision: number;
  }) => Promise<{ entry: MoldataKeyCatalogEntry; revision: number }>;
  updateEntries: (params: {
    entries: Array<Pick<MoldataKeyCatalogEntry, "id" | "english" | "japanese">>;
    expectedRevision: number;
  }) => Promise<MoldataKeyCatalog>;
  reorder: (params: {
    orderedIds: string[];
    expectedRevision: number;
  }) => Promise<MoldataKeyCatalog>;
  delete: (params: { id: string; expectedRevision: number }) => Promise<MoldataKeyCatalog>;
}

export function createMoldataKeyCatalogRepository(database: DB): MoldataKeyCatalogRepository {
  return {
    async get() {
      const [catalog, entries] = await Promise.all([
        database.query.moldataKeyCatalog.findFirst({
          where: eq(moldataKeyCatalog.id, GLOBAL_MOLDATA_KEY_CATALOG_ID),
        }),
        database
          .select()
          .from(moldataKeyCatalogEntry)
          .orderBy(asc(moldataKeyCatalogEntry.position)),
      ]);

      return {
        revision: catalog?.revision ?? 0,
        entries,
      };
    },

    async initializeDefaults() {
      return database.transaction(async (tx) => {
        const [existingEntry] = await tx
          .select({ id: moldataKeyCatalogEntry.id })
          .from(moldataKeyCatalogEntry)
          .limit(1);

        if (existingEntry) {
          const [[catalog], entries] = await Promise.all([
            tx
              .select({ revision: moldataKeyCatalog.revision })
              .from(moldataKeyCatalog)
              .where(eq(moldataKeyCatalog.id, GLOBAL_MOLDATA_KEY_CATALOG_ID))
              .limit(1),
            tx.select().from(moldataKeyCatalogEntry).orderBy(asc(moldataKeyCatalogEntry.position)),
          ]);

          return {
            created: false,
            catalog: { revision: catalog?.revision ?? 0, entries },
          };
        }

        const [currentCatalog] = await tx
          .select({ revision: moldataKeyCatalog.revision })
          .from(moldataKeyCatalog)
          .where(eq(moldataKeyCatalog.id, GLOBAL_MOLDATA_KEY_CATALOG_ID))
          .limit(1);

        const [createdCatalog] = currentCatalog
          ? await tx
              .update(moldataKeyCatalog)
              .set({ revision: currentCatalog.revision + 1 })
              .where(eq(moldataKeyCatalog.id, GLOBAL_MOLDATA_KEY_CATALOG_ID))
              .returning({ revision: moldataKeyCatalog.revision })
          : await tx
              .insert(moldataKeyCatalog)
              .values({ id: GLOBAL_MOLDATA_KEY_CATALOG_ID, revision: 1 })
              .returning({ revision: moldataKeyCatalog.revision });

        const entries = await tx
          .insert(moldataKeyCatalogEntry)
          .values(
            defaultPairs.map(([english, japanese], position) => ({ english, japanese, position })),
          )
          .returning();

        return {
          created: true,
          catalog: {
            revision: createdCatalog.revision,
            entries,
          },
        };
      });
    },

    async create({ english, japanese, expectedRevision }) {
      return database.transaction(async (tx) => {
        const [[currentCatalog], [duplicate], [lastEntry]] = await Promise.all([
          tx
            .select({ revision: moldataKeyCatalog.revision })
            .from(moldataKeyCatalog)
            .where(eq(moldataKeyCatalog.id, GLOBAL_MOLDATA_KEY_CATALOG_ID))
            .limit(1),
          tx
            .select({ id: moldataKeyCatalogEntry.id })
            .from(moldataKeyCatalogEntry)
            .where(sql`lower(${moldataKeyCatalogEntry.english}) = lower(${english})`)
            .limit(1),
          tx
            .select({ position: moldataKeyCatalogEntry.position })
            .from(moldataKeyCatalogEntry)
            .orderBy(desc(moldataKeyCatalogEntry.position))
            .limit(1),
        ]);

        const revision = currentCatalog?.revision ?? 0;
        if (revision !== expectedRevision) throw new MoldataKeyCatalogConflictError();
        if (duplicate) throw new MoldataKeyCatalogDuplicateKeyError();

        const nextRevision = revision + 1;
        if (currentCatalog) {
          const [updated] = await tx
            .update(moldataKeyCatalog)
            .set({ revision: nextRevision })
            .where(
              sql`${moldataKeyCatalog.id} = ${GLOBAL_MOLDATA_KEY_CATALOG_ID} and ${moldataKeyCatalog.revision} = ${expectedRevision}`,
            )
            .returning({ revision: moldataKeyCatalog.revision });

          if (!updated) throw new MoldataKeyCatalogConflictError();
        } else {
          await tx
            .insert(moldataKeyCatalog)
            .values({ id: GLOBAL_MOLDATA_KEY_CATALOG_ID, revision: nextRevision });
        }

        let entry: MoldataKeyCatalogEntry;
        try {
          [entry] = await tx
            .insert(moldataKeyCatalogEntry)
            .values({ english, japanese, position: (lastEntry?.position ?? -1) + 1 })
            .returning();
        } catch (error) {
          if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            (error as { code?: string }).code === "23505"
          ) {
            throw new MoldataKeyCatalogDuplicateKeyError();
          }
          throw error;
        }

        return { entry, revision: nextRevision };
      });
    },

    async updateEntries({ entries, expectedRevision }) {
      return database.transaction(async (tx) => {
        const [[catalog], existingEntries] = await Promise.all([
          tx
            .select({ revision: moldataKeyCatalog.revision })
            .from(moldataKeyCatalog)
            .where(eq(moldataKeyCatalog.id, GLOBAL_MOLDATA_KEY_CATALOG_ID))
            .limit(1),
          tx.select().from(moldataKeyCatalogEntry).orderBy(asc(moldataKeyCatalogEntry.position)),
        ]);

        if (!catalog || catalog.revision !== expectedRevision) {
          throw new MoldataKeyCatalogConflictError();
        }
        if (
          entries.length !== existingEntries.length ||
          new Set(entries.map((entry) => entry.id)).size !== entries.length ||
          entries.some((entry) => !existingEntries.some((existing) => existing.id === entry.id))
        ) {
          throw new MoldataKeyCatalogValidationError("The submitted catalog entries are invalid.");
        }

        const normalizedEntries = entries.map((entry) => ({
          ...entry,
          english: entry.english.trim(),
          japanese: entry.japanese.trim(),
        }));
        if (normalizedEntries.some((entry) => !entry.english || !entry.japanese)) {
          throw new MoldataKeyCatalogValidationError("English and Japanese values are required.");
        }
        if (
          new Set(normalizedEntries.map((entry) => entry.english.toLowerCase())).size !==
          normalizedEntries.length
        ) {
          throw new MoldataKeyCatalogDuplicateKeyError();
        }

        const [updated] = await tx
          .update(moldataKeyCatalog)
          .set({ revision: catalog.revision + 1 })
          .where(
            sql`${moldataKeyCatalog.id} = ${GLOBAL_MOLDATA_KEY_CATALOG_ID} and ${moldataKeyCatalog.revision} = ${expectedRevision}`,
          )
          .returning({ revision: moldataKeyCatalog.revision });
        if (!updated) throw new MoldataKeyCatalogConflictError();

        const positions = new Map(existingEntries.map((entry) => [entry.id, entry.position]));
        const entriesWithPositions = normalizedEntries.map((entry) => {
          const position = positions.get(entry.id);
          if (position === undefined) {
            throw new MoldataKeyCatalogValidationError(
              "The submitted catalog entries are invalid.",
            );
          }
          return { ...entry, position };
        });
        await tx.delete(moldataKeyCatalogEntry);
        const savedEntries = await tx
          .insert(moldataKeyCatalogEntry)
          .values(entriesWithPositions)
          .returning();

        return {
          revision: updated.revision,
          entries: savedEntries.sort((a, b) => a.position - b.position),
        };
      });
    },

    async reorder({ orderedIds, expectedRevision }) {
      return database.transaction(async (tx) => {
        const [[catalog], existingEntries] = await Promise.all([
          tx
            .select({ revision: moldataKeyCatalog.revision })
            .from(moldataKeyCatalog)
            .where(eq(moldataKeyCatalog.id, GLOBAL_MOLDATA_KEY_CATALOG_ID))
            .limit(1),
          tx.select().from(moldataKeyCatalogEntry).orderBy(asc(moldataKeyCatalogEntry.position)),
        ]);

        if (!catalog || catalog.revision !== expectedRevision) {
          throw new MoldataKeyCatalogConflictError();
        }
        if (
          orderedIds.length !== existingEntries.length ||
          new Set(orderedIds).size !== orderedIds.length ||
          orderedIds.some((id) => !existingEntries.some((entry) => entry.id === id))
        ) {
          throw new MoldataKeyCatalogValidationError("The submitted catalog order is invalid.");
        }

        const [updated] = await tx
          .update(moldataKeyCatalog)
          .set({ revision: catalog.revision + 1 })
          .where(
            sql`${moldataKeyCatalog.id} = ${GLOBAL_MOLDATA_KEY_CATALOG_ID} and ${moldataKeyCatalog.revision} = ${expectedRevision}`,
          )
          .returning({ revision: moldataKeyCatalog.revision });
        if (!updated) throw new MoldataKeyCatalogConflictError();

        const entriesById = new Map(existingEntries.map((entry) => [entry.id, entry]));
        await tx.delete(moldataKeyCatalogEntry);
        const savedEntries = await tx
          .insert(moldataKeyCatalogEntry)
          .values(
            orderedIds.map((id, position) => {
              const entry = entriesById.get(id);
              if (!entry) {
                throw new MoldataKeyCatalogValidationError(
                  "The submitted catalog order is invalid.",
                );
              }
              return { ...entry, position };
            }),
          )
          .returning();

        return {
          revision: updated.revision,
          entries: savedEntries.sort((a, b) => a.position - b.position),
        };
      });
    },

    async delete({ id, expectedRevision }) {
      return database.transaction(async (tx) => {
        const [catalog] = await tx
          .select({ revision: moldataKeyCatalog.revision })
          .from(moldataKeyCatalog)
          .where(eq(moldataKeyCatalog.id, GLOBAL_MOLDATA_KEY_CATALOG_ID))
          .limit(1);
        if (!catalog || catalog.revision !== expectedRevision) {
          throw new MoldataKeyCatalogConflictError();
        }

        const [updated] = await tx
          .update(moldataKeyCatalog)
          .set({ revision: catalog.revision + 1 })
          .where(
            sql`${moldataKeyCatalog.id} = ${GLOBAL_MOLDATA_KEY_CATALOG_ID} and ${moldataKeyCatalog.revision} = ${expectedRevision}`,
          )
          .returning({ revision: moldataKeyCatalog.revision });
        if (!updated) throw new MoldataKeyCatalogConflictError();

        const [deleted] = await tx
          .delete(moldataKeyCatalogEntry)
          .where(eq(moldataKeyCatalogEntry.id, id))
          .returning({ id: moldataKeyCatalogEntry.id });
        if (!deleted) throw new MoldataKeyCatalogValidationError("Moldata key was not found.");

        const entries = await tx
          .select()
          .from(moldataKeyCatalogEntry)
          .orderBy(asc(moldataKeyCatalogEntry.position));
        return { revision: updated.revision, entries };
      });
    },
  };
}

export const moldataKeyCatalogRepository = createMoldataKeyCatalogRepository(db);
