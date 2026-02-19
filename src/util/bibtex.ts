/**
 * BibTeX utilities for Google Scholar citation extraction.
 *
 * Parses the Scholar citation popup HTML to extract the BibTeX download URL.
 */

/**
 * Extract the BibTeX URL from a Google Scholar citation popup HTML.
 *
 * The citation popup contains anchor tags with class "gs_citi" for each
 * format (MLA, APA, Chicago, Harvard, Vancouver, BibTeX, EndNote, RefMan, RefWorks).
 * The BibTeX link has the text "BibTeX".
 *
 * @returns The BibTeX URL, or null if not found.
 */
export function extractBibtexUrl(html: string): string | null {
  if (!html) return null;

  // Match anchor tags with class containing "gs_citi" and text "BibTeX"
  const match = html.match(
    /<a[^>]*class="gs_citi"[^>]*href="([^"]*)"[^>]*>\s*BibTeX\s*<\/a>/,
  );

  return match ? match[1].replace(/&amp;/g, "&") : null;
}

/**
 * Inject an abstract field into a BibTeX entry string.
 *
 * Inserts `abstract = {text}` as the last field before the closing `}`.
 * If the abstract is empty or whitespace-only, returns the BibTeX unchanged.
 * Curly braces in the abstract text are escaped with backslashes.
 *
 * @param bibtex - The raw BibTeX entry string.
 * @param abstract - The abstract text to inject.
 * @returns The BibTeX string with the abstract field added.
 */
export function injectAbstract(bibtex: string, abstract: string): string {
  const trimmed = abstract.trim();
  if (!trimmed) return bibtex;

  // Escape curly braces in the abstract text
  const escaped = trimmed.replace(/\{/g, "\\{").replace(/\}/g, "\\}");

  // Find the last closing brace
  const lastBrace = bibtex.lastIndexOf("}");
  if (lastBrace === -1) return bibtex;

  // Get content before the closing brace
  const before = bibtex.slice(0, lastBrace);

  // Find the last non-whitespace character before the closing brace
  const trimmedBefore = before.trimEnd();
  const lastChar = trimmedBefore[trimmedBefore.length - 1];

  // If last field line does not end with a comma, add one
  // But if it already ends with comma, keep it as is
  let prefix: string;
  if (lastChar === ",") {
    prefix = trimmedBefore;
  } else {
    prefix = trimmedBefore + ",";
  }

  return `${prefix}\n  abstract={${escaped}}\n}`;
}
