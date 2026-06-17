export type PaginationMeta = {
  hasMore: boolean;
  nextCursor: string | null;
};

export function shouldBumpPaginationRevision(
  mode: 'initial' | 'refresh' | 'silent' | 'append',
  prev: PaginationMeta,
  next: PaginationMeta,
): boolean {
  return (
    mode === 'append' ||
    next.hasMore !== prev.hasMore ||
    next.nextCursor !== prev.nextCursor
  );
}

export function buildLoadMoreTriggerKey(cursor: number, epoch: number): string {
  return `${cursor}\0${epoch}`;
}
