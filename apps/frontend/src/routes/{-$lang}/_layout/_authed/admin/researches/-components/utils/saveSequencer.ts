/**
 * Pure save sequencer for the research Save flow.
 *
 * The research write (update or patch) and the uids write target the *same*
 * Elasticsearch document. Firing them concurrently with the same stale lock token
 * makes whichever lands second 409 on a version conflict — a pre-existing race on
 * the draft Save-with-uids path. The fix is to run them sequentially: perform the
 * research write first, then thread its *post-write* lock token into the uids write.
 *
 * This module encodes only that sequencing decision — no React, no network — so it
 * can be unit-tested in isolation. The two writes are injected as callables.
 */

/** Optimistic-locking token returned by a successful write. */
export interface LockToken {
  _seq_no: number;
  _primary_term: number;
}

/** Result of the primary (research) write. */
export type ResearchWriteResult<TData extends { meta: LockToken }> =
  | { ok: true; data: TData }
  | { ok: false; error: string; code: string };

/** Result of the secondary (uids) write. */
export type UidsWriteResult =
  | { ok: true }
  | { ok: false; error: string; code: string };

export interface SaveSequencerParams<TData extends { meta: LockToken }> {
  /** Performs the research write (update or patch) with the current lock token. */
  writeResearch: () => Promise<ResearchWriteResult<TData>>;
  /**
   * Performs the uids write, threading the lock token returned by the research
   * write. Only invoked when {@link shouldWriteUids} is true and the research
   * write succeeded. Omit (or leave undefined) when uids are never written here.
   */
  writeUids?: (lock: LockToken) => Promise<UidsWriteResult>;
  /**
   * Whether the uids write should run at all — false when uids editing is not
   * permitted or uids are unchanged. When false the uids write is skipped entirely.
   */
  shouldWriteUids: boolean;
}

/**
 * Runs the research write first; on success, and only when applicable, runs the
 * uids write threading the research write's fresh lock token. A research-write
 * conflict (or any failure) short-circuits before the uids write.
 *
 * Returns the research write result — its lock token is what the caller refreshes
 * for consecutive saves. The uids result, when produced, is the *last* write, so
 * its meta need not be consumed further; a uids failure is returned in its place so
 * the caller can surface it.
 */
export async function runResearchSave<TData extends { meta: LockToken }>({
  writeResearch,
  writeUids,
  shouldWriteUids,
}: SaveSequencerParams<TData>): Promise<ResearchWriteResult<TData>> {
  const researchResult = await writeResearch();

  // Short-circuit: a failed/conflicting research write never proceeds to uids.
  if (!researchResult.ok) return researchResult;

  if (shouldWriteUids && writeUids) {
    const uidsResult = await writeUids(researchResult.data.meta);
    if (!uidsResult.ok) {
      // Surface the uids failure; the research write already landed.
      return uidsResult as ResearchWriteResult<TData>;
    }
  }

  return researchResult;
}
