/**
 * Re-export of the shared notification/interest keyword vocabulary.
 *
 * The implementation lives in shared/notify/ so the Expo client and the Next.js
 * notification backend compile the exact same matching logic instead of two ports
 * that drift (they already had: formatInterestLabel diverged before consolidation).
 */
export * from '@/shared/notify/interestKeywords';
