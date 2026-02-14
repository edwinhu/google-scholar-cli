/**
 * HTML Result Card Extractor for Google Scholar Labs API
 *
 * Parses Scholar result card HTML into structured data using regex/string
 * methods only (zero external dependencies).
 */

export interface FullTextLink {
  url: string;
  label: string;
  type: string;
}

export interface ScholarResult {
  title: string;
  authors: string;
  journal: string;
  year: string;
  publisher: string;
  snippet: string;
  url: string;
  pdfUrl: string | null;
  fullTextLinks: FullTextLink[];
  citations: number;
  clusterId: string;
  position: number;
}

/** Extract the value of a named attribute from an HTML string. */
function extractAttr(html: string, attr: string): string {
  const m = html.match(new RegExp(`${attr}="([^"]*)"`));
  return m ? m[1] : "";
}

/**
 * Return the substring between the first occurrence of `startTag` and the
 * next occurrence of `endTag` after it.
 */
function extractBetween(html: string, startTag: string, endTag: string): string {
  const start = html.indexOf(startTag);
  if (start === -1) return "";
  const contentStart = start + startTag.length;
  const end = html.indexOf(endTag, contentStart);
  if (end === -1) return "";
  return html.slice(contentStart, end);
}

/** Strip all HTML tags from a string. */
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

/** Decode common HTML entities. */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8208;/g, "-")
    .replace(/&uuml;/g, "\u00FC")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

/**
 * Extract a complete section starting with `startTag` using div-depth counting
 * to find the matching closing `</div>`. Returns the full inner HTML of the
 * section, or empty string if not found.
 */
function extractSectionByDepth(html: string, startTag: string): string {
  const startIdx = html.indexOf(startTag);
  if (startIdx === -1) return "";

  // Find the opening '<div' before startTag
  const divStart = html.lastIndexOf("<div", startIdx);
  if (divStart === -1) return "";

  let depth = 0;
  let i = divStart;
  while (i < html.length) {
    if (html.startsWith("<div", i)) {
      depth++;
      i += 4;
    } else if (html.startsWith("</div>", i)) {
      depth--;
      if (depth === 0) {
        // Return everything between the opening tag end and this closing tag
        const contentStart = html.indexOf(">", divStart) + 1;
        return html.slice(contentStart, i);
      }
      i += 6;
    } else {
      i++;
    }
  }
  return "";
}

/**
 * Extract all <a> tags from an HTML string and return FullTextLink objects.
 */
function extractLinksFromHtml(sectionHtml: string): FullTextLink[] {
  const links: FullTextLink[] = [];
  const anchorRegex = /<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(sectionHtml)) !== null) {
    const rawUrl = match[1];
    const rawContent = match[2];
    let url = decodeEntities(rawUrl);
    // Resolve relative Scholar URLs to absolute
    if (url.startsWith("/")) {
      url = "https://scholar.google.com" + url;
    }
    const label = decodeEntities(stripTags(rawContent)).replace(/\s+/g, " ").trim();

    let type: string;
    if (rawContent.includes("[PDF]")) {
      type = "pdf";
    } else if (rawContent.includes("[HTML]")) {
      type = "html";
    } else {
      type = "link";
    }

    links.push({ url, label, type });
  }

  return links;
}

/**
 * Check if a link text matches a standard Scholar footer action
 * (Cited by, Related articles, All N versions, Save, Cite).
 */
function isScholarFooterAction(label: string): boolean {
  return /^(Cited by|Related articles|All \d+ versions?|Save|Cite|Library)/.test(label);
}

/**
 * Parse the gs_a metadata line into authors, journal, year, and publisher.
 *
 * Format: "Author1, Author2 - Journal, Year - Publisher"
 * The " - " delimiter separates the three parts.
 */
function parseGsA(gsAText: string): {
  authors: string;
  journal: string;
  year: string;
  publisher: string;
} {
  if (!gsAText) {
    return { authors: "", journal: "", year: "", publisher: "" };
  }

  // Split on " - " (space-dash-space)
  const parts = gsAText.split(" - ");

  const authors = (parts[0] || "").trim();

  // Extract year: 4-digit number anywhere in the full text
  const yearMatch = gsAText.match(/\b(\d{4})\b/);
  const year = yearMatch ? yearMatch[1] : "";

  // Journal is the middle part, strip the year and trailing comma
  let journal = "";
  if (parts.length >= 2) {
    journal = parts[1]
      .replace(/,?\s*\d{4}\s*$/, "")
      .trim();
  }

  // Publisher is the last part (if there are at least 3 parts)
  const publisher = parts.length >= 3 ? parts[2].trim() : "";

  return { authors, journal, year, publisher };
}

/**
 * Parse a single Scholar result card HTML string into a ScholarResult.
 *
 * @param html - The HTML of one result card (the `h` field from a finding)
 * @param fallbackPosition - Position to use if data-rp is not found
 */
export function parseResultCard(html: string, fallbackPosition: number): ScholarResult {
  if (!html) {
    return {
      title: "",
      authors: "",
      journal: "",
      year: "",
      publisher: "",
      snippet: "",
      url: "",
      pdfUrl: null,
      fullTextLinks: [],
      citations: 0,
      clusterId: "",
      position: fallbackPosition,
    };
  }

  // clusterId from data-cid attribute
  const clusterId = extractAttr(html, "data-cid");

  // position from data-rp attribute
  const rpStr = extractAttr(html, "data-rp");
  const position = rpStr !== "" ? parseInt(rpStr, 10) : fallbackPosition;

  // Title: text inside <h3 class="gs_rt" ...>...</h3> (may have extra attrs)
  const titleH3Match = html.match(/<h3 class="gs_rt"[^>]*>([\s\S]*?)<\/h3>/);
  const titleLinkHtml = titleH3Match ? titleH3Match[1] : "";
  const titleAnchorMatch = titleLinkHtml.match(/<a[^>]*>([\s\S]*?)<\/a>/);
  const title = titleAnchorMatch
    ? decodeEntities(stripTags(titleAnchorMatch[1]))
    : decodeEntities(stripTags(titleLinkHtml));

  // URL: href attribute of <a> inside <h3 class="gs_rt">
  const urlMatch = titleLinkHtml.match(/href="([^"]*)"/);
  const url = urlMatch ? decodeEntities(urlMatch[1]) : "";

  // Full-text links: extract all links from gs_ggs section using depth counting
  const fullTextLinks: FullTextLink[] = [];
  const ggsSection = extractSectionByDepth(html, '"gs_ggs');
  if (ggsSection) {
    fullTextLinks.push(...extractLinksFromHtml(ggsSection));
  }

  // Also check gs_fl gs_flb footer for institutional links (LibKey, etc.)
  const footerMatch = html.match(
    /<div class="gs_fl gs_flb">([\s\S]*?)<\/div>/
  );
  if (footerMatch) {
    const footerLinks = extractLinksFromHtml(footerMatch[1]);
    for (const link of footerLinks) {
      if (!isScholarFooterAction(link.label)) {
        fullTextLinks.push(link);
      }
    }
  }

  // Backward compat: pdfUrl is the first pdf-type link, or first link overall
  const firstPdfLink = fullTextLinks.find((l) => l.type === "pdf");
  const pdfUrl = firstPdfLink
    ? firstPdfLink.url
    : fullTextLinks.length > 0
      ? fullTextLinks[0].url
      : null;

  // Author/Journal metadata from <div class="gs_a">
  const gsAHtml = extractBetween(html, '<div class="gs_a">', "</div>");
  const gsAText = decodeEntities(stripTags(gsAHtml));
  const { authors, journal, year, publisher } = parseGsA(gsAText);

  // Snippet from <div class="gs_rs"> (contains nested gs_rs_tbs div)
  const gsRsMatch = html.match(/<div class="gs_rs">([\s\S]*?)<\/div>\s*<\/div>/);
  const snippetHtml = gsRsMatch ? gsRsMatch[1] : "";
  const snippet = decodeEntities(stripTags(snippetHtml)).replace(/\s+/g, " ").trim();

  // Citations: parse "Cited by N" from gs_fl links
  const citedByMatch = html.match(/Cited by (\d+)/);
  const citations = citedByMatch ? parseInt(citedByMatch[1], 10) : 0;

  return {
    title,
    authors,
    journal,
    year,
    publisher,
    snippet,
    url,
    pdfUrl,
    fullTextLinks,
    citations,
    clusterId,
    position,
  };
}

/**
 * Parse an array of finding objects from the Scholar Labs API into
 * ScholarResult objects.
 *
 * @param findings - Array of {h: html_string, i: position} objects
 */
export function parseResultCards(
  findings: Array<{ h: string; i: number }>
): ScholarResult[] {
  return findings.map((f) => {
    const result = parseResultCard(f.h, f.i);
    // The finding's i field is the authoritative position
    result.position = f.i;
    return result;
  });
}

/**
 * Parse a full Google Scholar results page HTML into ScholarResult objects.
 * Used for traditional keyword search (GET /scholar?q=query).
 *
 * Uses div-depth counting to extract complete result cards (which contain
 * 8+ nested divs in real Scholar HTML).
 */
export function parseScholarPage(pageHtml: string): ScholarResult[] {
  const results: ScholarResult[] = [];
  const marker = 'class="gs_r gs_or gs_scl"';
  let searchStart = 0;
  let position = 0;

  while (true) {
    const markerIdx = pageHtml.indexOf(marker, searchStart);
    if (markerIdx === -1) break;

    const divStart = pageHtml.lastIndexOf("<div", markerIdx);
    if (divStart === -1) break;

    // Walk forward counting div depth to find the matching closing tag
    let depth = 0;
    let i = divStart;
    let endIdx = -1;
    while (i < pageHtml.length) {
      if (pageHtml.startsWith("<div", i)) {
        depth++;
        i += 4;
      } else if (pageHtml.startsWith("</div>", i)) {
        depth--;
        if (depth === 0) {
          endIdx = i + 6;
          break;
        }
        i += 6;
      } else {
        i++;
      }
    }

    if (endIdx === -1) break;

    results.push(parseResultCard(pageHtml.slice(divStart, endIdx), position));
    position++;
    searchStart = endIdx;
  }

  return results;
}

/**
 * Extract the result count string from a Scholar results page.
 * Returns the text like "About 12,300 results" or empty string if not found.
 */
export function parseResultCount(pageHtml: string): string {
  const match = pageHtml.match(/<div class="gs_ab_mdw">(.*?)<\/div>/);
  return match ? stripTags(match[1]).trim() : "";
}
