import { existsSync, readFileSync } from "node:fs";
import { resolveCookies, resolveAllCookies, cookiesForUrl } from "../auth.js";
import { API_BASE, INST_FILE } from "../config.js";
import { navHeaders } from "../identity.js";
import { fetchBibtex, downloadPdf, SERVICE } from "../api/scholar.js";
import { parseScholarPage, parseResultCount } from "../util/html.js";
import { injectAbstract } from "../util/bibtex.js";
import { sanitizeFilename } from "../util/filename.js";
import { applyLimit } from "../util/limit.js";
import { blocked, exitCodeFor, cdpPort } from "../cdp.js";
import { printTable, printJson, printError, printProgress } from "../output.js";
import type { Cookies, BrowserCookie } from "../auth.js";
import type { ScholarResult, FullTextLink } from "../util/html.js";

interface LookupFlags {
  json: boolean;
  help: boolean;
  bibtex: boolean;
  download: boolean;
  limit?: number;
}

function cookieHeader(cookies: Cookies): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

/**
 * Build a cookie header for Scholar requests.
 * When browser cookies are available AND match the Scholar domain, use them
 * (includes the GSP cookie with library link configuration). Falls back to
 * Google auth cookies when no domain-matched browser cookies exist.
 */
function scholarCookieHeader(cookies: Cookies, allCookies?: BrowserCookie[]): string {
  if (allCookies && allCookies.length > 0) {
    const matched = cookiesForUrl(allCookies, API_BASE);
    if (matched) return matched;
  }
  return cookieHeader(cookies);
}

export async function cmdLookup(
  args: string[],
  flags: LookupFlags,
): Promise<number> {
  if (flags.help) {
    printLookupUsage();
    return 0;
  }

  const query = args.join(" ");

  if (!query) {
    printError('No query provided. Usage: scholar lookup "keyword search"');
    return 1;
  }

  try {
    const cookies = resolveCookies();
    const allCookies = resolveAllCookies();
    printProgress("Searching Google Scholar...");

    const inst = existsSync(INST_FILE)
      ? readFileSync(INST_FILE, "utf-8").trim()
      : "";
    const instParam = inst ? `&inst=${inst}` : "";
    const url = `${API_BASE}/scholar?q=${encodeURIComponent(query)}&hl=en${instParam}`;
    const resp = await fetch(url, {
      headers: {
        Cookie: scholarCookieHeader(cookies, allCookies),
        Referer: `${API_BASE}/`,
        ...navHeaders(),
      },
    });

    if (!resp.ok) {
      process.stderr.write("\r\x1b[K");
      printError(`Scholar returned ${resp.status} ${resp.statusText}`);
      return 1;
    }

    const html = await resp.text();
    process.stderr.write("\r\x1b[K");

    const found = parseScholarPage(html);
    const count = parseResultCount(html);
    const results = applyLimit(found, flags.limit);

    if (found.length === 0) {
      if (html.includes("gs_captcha")) {
        // Same taxonomy as the Labs path: a CAPTCHA is TEMPFAIL, not "no results".
        throw blocked(SERVICE, cdpPort());
      }
      printError("No results found.");
      return 1;
    }

    if (count) {
      console.error(count);
    }

    if (flags.bibtex) {
      return bibtexOutput(results, cookies, allCookies, flags);
    }

    if (flags.json) {
      printJson(results);
    } else {
      const headers = ["#", "Title", "Authors", "Year", "Cited", "Journal"];
      const rows = results.map((r) => [
        String(r.position + 1),
        r.title.length > 60 ? r.title.slice(0, 57) + "..." : r.title,
        r.authors.length > 30 ? r.authors.slice(0, 27) + "..." : r.authors,
        r.year,
        String(r.citations),
        r.journal.length > 25 ? r.journal.slice(0, 22) + "..." : r.journal,
      ]);
      printTable(headers, rows);

      // Print details below the table
      console.log("");
      for (const r of results) {
        console.log(`[${r.position + 1}] ${r.title}`);
        if (r.snippet) {
          console.log(`    ${r.snippet}`);
        }
        if (r.url) {
          console.log(`    ${r.url}`);
        }
        for (const link of r.fullTextLinks) {
          console.log(`    ${link.label}: ${link.url}`);
        }
        console.log("");
      }
    }

    if (flags.download) {
      await downloadResults(results, cookies, allCookies);
    }

    return 0;
  } catch (err) {
    process.stderr.write("\r\x1b[K");
    printError(err instanceof Error ? err.message : String(err));
    return exitCodeFor(err);
  }
}

async function bibtexOutput(
  results: ScholarResult[],
  cookies: Cookies,
  allCookies: BrowserCookie[],
  flags: LookupFlags,
): Promise<number> {
  const entries: Array<{ clusterId: string; bibtex: string }> = [];

  for (const r of results) {
    if (!r.clusterId) {
      console.error(`Warning: skipping result "${r.title}" (no cluster ID)`);
      continue;
    }

    printProgress(`Fetching BibTeX for ${r.clusterId}...`);
    const rawBibtex = await fetchBibtex(r.clusterId, cookies);
    const bibtex = injectAbstract(rawBibtex, r.snippet);
    entries.push({ clusterId: r.clusterId, bibtex });
  }

  process.stderr.write("\r\x1b[K");

  if (flags.json) {
    printJson(entries);
  } else {
    for (let i = 0; i < entries.length; i++) {
      if (i > 0) console.log("");
      console.log(entries[i].bibtex);
    }
  }

  return 0;
}

/**
 * Pick the best full-text link for downloading:
 * prefer type "pdf", then "link", skip "html".
 */
function pickBestLink(links: FullTextLink[]): FullTextLink | null {
  const pdf = links.find((l) => l.type === "pdf");
  if (pdf) return pdf;
  const link = links.find((l) => l.type === "link");
  if (link) return link;
  return null;
}

/**
 * Download PDFs for all results that have full-text links.
 */
async function downloadResults(
  results: ScholarResult[],
  cookies: Cookies,
  allCookies?: BrowserCookie[],
): Promise<void> {
  let downloaded = 0;
  let skipped = 0;

  for (const r of results) {
    if (r.fullTextLinks.length === 0) continue;

    const bestLink = pickBestLink(r.fullTextLinks);
    if (!bestLink) continue;

    const filename = sanitizeFilename(r.title) + ".pdf";

    if (existsSync(filename)) {
      process.stderr.write(`Skipping ${filename} (already exists)\n`);
      skipped++;
      continue;
    }

    process.stderr.write(`Downloading ${filename}...\n`);
    try {
      await downloadPdf(bestLink.url, filename, cookies, allCookies);
      downloaded++;
    } catch (err) {
      process.stderr.write(
        `Failed to download ${filename}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  process.stderr.write(
    `\nDownload complete: ${downloaded} downloaded, ${skipped} skipped\n`,
  );
}

function printLookupUsage(): void {
  console.log(`scholar lookup - Traditional Google Scholar keyword search

Usage: scholar lookup "query" [options]

Options:
  --json       Output as JSON
  --limit <n>  Keep only the first n results
  --bibtex     Fetch BibTeX citations for each result (with abstract)
  --download   Download PDFs for results with full-text links
  --help       Show this help

Examples:
  scholar lookup "machine learning transformers"
  scholar lookup "author:hinton deep learning" --json
  scholar lookup "machine learning transformers" --limit 3
  scholar lookup "attention is all you need" --bibtex
  scholar lookup "attention is all you need" --download`);
}
