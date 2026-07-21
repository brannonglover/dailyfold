export type FoldSlotKind = 'lead' | 'gridLeft' | 'gridRight' | 'row';

export interface FoldSlot {
  kind: FoldSlotKind;
}

/**
 * Presentation rhythm for the newspaper-style "fold" feed: one full-width
 * lead, one 2-up grid pair (fast scan, low commitment), then every
 * remaining story as a full-width row — one story gets the whole line to
 * itself, reading as more consequential than one sharing a row.
 */
export function computeFoldLayout(count: number): FoldSlot[] {
  const slots: FoldSlot[] = [];
  for (let i = 0; i < count; i++) {
    if (i === 0) slots.push({ kind: 'lead' });
    else if (i === 1) slots.push({ kind: 'gridLeft' });
    else if (i === 2) slots.push({ kind: 'gridRight' });
    else slots.push({ kind: 'row' });
  }
  return slots;
}
