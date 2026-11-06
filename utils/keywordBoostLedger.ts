/**
 * Remembers which keyword interests have already been searched for the *current* article pool.
 *
 * The pool is wholesale replaced by a refresh or a saved-snapshot adoption, and anything merged
 * into it earlier (archive matches for a keyword) disappears with it. Entries are therefore keyed
 * by a pool revision — the feed generation that bumps on every replacement — so the same keyword
 * is fetched again for each new pool but never twice for one.
 */
export interface KeywordBoostLedger {
  /** Keywords (trimmed, non-empty) that still need fetching for this pool revision. */
  pending(poolRevision: number, keywords: readonly string[]): string[];
  markDone(poolRevision: number, keyword: string): void;
}

export function createKeywordBoostLedger(): KeywordBoostLedger {
  const done = new Set<string>();
  const key = (revision: number, keyword: string) => `${revision}\0${keyword}`;
  return {
    pending(poolRevision, keywords) {
      return keywords
        .map((keyword) => keyword.trim())
        .filter((keyword) => keyword.length > 0 && !done.has(key(poolRevision, keyword)));
    },
    markDone(poolRevision, keyword) {
      done.add(key(poolRevision, keyword.trim()));
    },
  };
}
