import type { ScholarResult } from "./html.js";

/**
 * Apply --limit to a result list. Neither backend takes a result count we can
 * rely on — Labs streams results as it finds them, and /scholar returns a full
 * page — so the cap is applied client-side.
 */
export function applyLimit(
  results: ScholarResult[],
  limit?: number,
): ScholarResult[] {
  return limit === undefined ? results : results.slice(0, limit);
}
