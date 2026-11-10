import { COURTS } from "./courts-data.js";

/** Scholar's as_sdt value for "Case law" across all courts. */
export const CASE_LAW_ALL = "2006";

/**
 * Normalize a court name for lookup in COURTS: lowercase, drop periods and
 * commas, collapse whitespace, and expand common abbreviations so
 * "10th Cir.", "Utah Ct. App." and "D. Utah" all resolve.
 */
export function normalizeCourt(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\bcir\b/g, "circuit")
    .replace(/\bct\b/g, "court")
    .replace(/\bapp\b/g, "appeals")
    .replace(/\bsup\b/g, "supreme")
    .replace(/\bcourt appeals\b/g, "court of appeals")
    .replace(/\bd c\b/g, "dc");
}

/**
 * Resolve --court values to Scholar court IDs. A value that is already a
 * comma-separated list of numeric IDs passes through unchanged.
 */
export function resolveCourts(names: string[]): { ids: string[]; unknown: string[] } {
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const name of names) {
    if (/^\d+(,\d+)*$/.test(name.trim())) {
      ids.push(...name.trim().split(","));
      continue;
    }
    const hit = COURTS[normalizeCourt(name)];
    if (hit) ids.push(...hit.split(","));
    else unknown.push(name);
  }
  return { ids: [...new Set(ids)], unknown };
}

/**
 * The as_sdt query value for a case-law search: all courts when no IDs are
 * given, otherwise "4," followed by the court IDs (what Scholar's court
 * picker submits).
 */
export function caseLawSdt(ids: string[]): string {
  return ids.length === 0 ? CASE_LAW_ALL : `4,${ids.join(",")}`;
}

/** Court keys whose name contains the filter (for `scholar courts`). */
export function listCourts(filter = ""): Array<[string, string]> {
  const f = normalizeCourt(filter);
  return Object.entries(COURTS).filter(([k]) => k.includes(f));
}
