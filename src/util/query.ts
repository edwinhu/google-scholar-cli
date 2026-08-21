/**
 * Journal restriction for the classic Scholar endpoint.
 *
 * Scholar has no documented venue parameter. `as_publication=` — the name the
 * advanced-search form uses — is accepted and then silently ignored on
 * GET /scholar. The undocumented `source:"..."` operator, embedded in q, is
 * what actually filters, and multiple terms combine with OR.
 *
 * Because the mechanism is undocumented it can disappear without notice, which
 * is what tests/journal-query.test.ts pins.
 */

/** Scholar's q parameter starts dropping terms past roughly this length. */
export const MAX_QUERY_LENGTH = 256;

/**
 * Quote a journal name as a source: term.
 * Embedded double quotes would terminate the term early, so they are stripped
 * rather than escaped — Scholar has no escape syntax inside a quoted phrase.
 */
function sourceTerm(journal: string): string {
  return `source:"${journal.replace(/"/g, "").trim()}"`;
}

/**
 * Append a journal restriction to a Scholar query.
 * Blank names are dropped; an empty list returns the query untouched.
 */
export function buildJournalQuery(query: string, journals: string[]): string {
  const terms = journals
    .map((j) => j.trim())
    .filter((j) => j.length > 0)
    .map(sourceTerm);

  if (terms.length === 0) return query;

  const clause = terms.join(" OR ");
  return query.trim() ? `${query.trim()} ${clause}` : clause;
}
