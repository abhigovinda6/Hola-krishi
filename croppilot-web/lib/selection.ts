// Single source of truth for the crop selection on /results (an older saved selection is still honoured).
import type { Farm } from "./farm";
import { selList, profileKey } from "./farm";
export { profileKey };
export const RECOMMENDED_N = 3;

/**
 * The selection to show, count and compare: always a subset of the feasible crops.
 * A selection saved for different farm inputs (stale) or not made yet -> the top-N recommended crops.
 * An explicit "none" ("-") for the same inputs stays empty.
 */
export function effectiveSelection(f: Farm, feasible: string[], recommended: string[]): string[] {
  const chosen = selList(f);
  if (chosen === null || f.selk !== profileKey(f)) return recommended.filter((c) => feasible.includes(c));
  return feasible.filter((c) => chosen.includes(c));
}

/** Server side (/api/summary): the crops to summarise = feasible, in rank order, intersected with the selection the
 * client sent. No selection sent (unset or stale on the client) -> the top RECOMMENDED_N feasible crops, exactly
 * what /results shows. Unknown / infeasible ids are ignored. */
export function summaryCrops<T extends { crop: string; feasible: boolean }>(results: T[], selected: unknown): T[] {
  const feas = results.filter((r) => r.feasible);
  if (!Array.isArray(selected)) return feas.slice(0, RECOMMENDED_N);
  return feas.filter((r) => (selected as unknown[]).includes(r.crop));
}
