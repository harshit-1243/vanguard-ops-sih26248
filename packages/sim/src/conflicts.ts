import { areAdjacent, type ConflictView, type IntelItem } from '@vanguard/shared';

export const CONFLICT_WINDOW_MS = 600_000;
const RELEVANT = new Set(['CONTACT', 'NEGATIVE', 'RECON']);

function isPositive(i: IntelItem): boolean {
  return (i.kind === 'CONTACT' || i.kind === 'RECON') && (i.count === null || i.count > 0);
}
function isNegative(i: IntelItem): boolean {
  return i.kind === 'NEGATIVE' || (i.kind === 'RECON' && i.count === 0);
}

/** Why two items conflict (PRD §7.7), or null. Items from the same source never conflict. */
export function conflictReason(a: IntelItem, b: IntelItem): string | null {
  if (!a.cell || !b.cell) return null;
  if (a.sourceLabel === b.sourceLabel) return null;
  if (Math.abs(a.observedAtMs - b.observedAtMs) > CONFLICT_WINDOW_MS) return null;
  if (a.cell === b.cell) {
    if ((isPositive(a) && isNegative(b)) || (isPositive(b) && isNegative(a))) {
      return `Contact vs no-contact at ${a.cell}`;
    }
    if (isPositive(a) && isPositive(b)) {
      if (a.unitType && b.unitType && a.unitType !== 'UNKNOWN' && b.unitType !== 'UNKNOWN' && a.unitType !== b.unitType) {
        return `Type mismatch at ${a.cell}: ${a.unitType} vs ${b.unitType}`;
      }
      if (a.count !== null && b.count !== null && Math.abs(a.count - b.count) >= 2) {
        return `Strength mismatch at ${a.cell}: ${a.count} vs ${b.count}`;
      }
    }
    return null;
  }
  if (
    a.kind === 'CONTACT' &&
    b.kind === 'CONTACT' &&
    areAdjacent(a.cell, b.cell) &&
    a.unitType === b.unitType &&
    a.count === b.count &&
    Math.abs(a.observedAtMs - b.observedAtMs) <= 60_000
  ) {
    return `Same group reported at ${a.cell} and ${b.cell}`;
  }
  return null;
}

/** Open conflicts among the most recent relevant intel items. */
export function detectConflicts(intel: readonly IntelItem[], flagged: ReadonlySet<string>, limit = 80): ConflictView[] {
  const items = intel.filter((i) => RELEVANT.has(i.kind) && i.cell).slice(-limit);
  const out: ConflictView[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!;
      const b = items[j]!;
      const reason = conflictReason(a, b);
      if (!reason) continue;
      const ids = [a.id, b.id].sort() as [string, string];
      out.push({
        id: `${ids[0]}~${ids[1]}`,
        itemIds: ids,
        cell: a.cell!,
        reason,
        flagged: flagged.has(a.id) || flagged.has(b.id),
      });
    }
  }
  return out;
}
