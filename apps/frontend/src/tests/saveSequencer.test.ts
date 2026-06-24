import { describe, expect, test } from "bun:test";

import type { LockToken } from "../routes/{-$lang}/_layout/_authed/admin/researches/-components/utils/saveSequencer";
import { runResearchSave } from "../routes/{-$lang}/_layout/_authed/admin/researches/-components/utils/saveSequencer";

interface ResearchData {
  meta: LockToken;
}

function researchOk(seqNo: number, primaryTerm: number) {
  return { ok: true as const, data: { meta: { _seq_no: seqNo, _primary_term: primaryTerm } } };
}

describe("runResearchSave", () => {
  test("runs research write first, then uids write threading the returned lock token", async () => {
    const order: string[] = [];
    const uidsLocks: LockToken[] = [];

    const result = await runResearchSave<ResearchData>({
      writeResearch: async () => {
        order.push("research");
        return researchOk(42, 7);
      },
      shouldWriteUids: true,
      writeUids: async (lock) => {
        order.push("uids");
        uidsLocks.push(lock);
        return { ok: true };
      },
    });

    expect(order).toEqual(["research", "uids"]);
    // uids must receive the POST-write token (42/7), not any stale one.
    expect(uidsLocks).toEqual([{ _seq_no: 42, _primary_term: 7 }]);
    expect(result).toEqual(researchOk(42, 7));
  });

  test("skips the uids write when shouldWriteUids is false", async () => {
    const order: string[] = [];

    const result = await runResearchSave<ResearchData>({
      writeResearch: async () => {
        order.push("research");
        return researchOk(1, 1);
      },
      shouldWriteUids: false,
      writeUids: async () => {
        order.push("uids");
        return { ok: true };
      },
    });

    expect(order).toEqual(["research"]);
    expect(result).toEqual(researchOk(1, 1));
  });

  test("does not invoke uids write when no writeUids callable is provided", async () => {
    const result = await runResearchSave<ResearchData>({
      writeResearch: async () => researchOk(2, 2),
      shouldWriteUids: true,
    });

    expect(result).toEqual(researchOk(2, 2));
  });

  test("short-circuits before the uids write when the research write conflicts", async () => {
    const order: string[] = [];

    const result = await runResearchSave<ResearchData>({
      writeResearch: async () => {
        order.push("research");
        return { ok: false as const, error: "stale", code: "CONFLICT" };
      },
      shouldWriteUids: true,
      writeUids: async () => {
        order.push("uids");
        return { ok: true };
      },
    });

    // uids never runs after a research conflict.
    expect(order).toEqual(["research"]);
    expect(result).toEqual({ ok: false, error: "stale", code: "CONFLICT" });
  });

  test("surfaces a uids write failure after a successful research write", async () => {
    const result = await runResearchSave<ResearchData>({
      writeResearch: async () => researchOk(3, 3),
      shouldWriteUids: true,
      writeUids: async () => ({ ok: false, error: "forbidden", code: "FORBIDDEN" }),
    });

    expect(result).toEqual({ ok: false, error: "forbidden", code: "FORBIDDEN" });
  });
});
