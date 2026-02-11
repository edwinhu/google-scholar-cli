import { resolveCookies } from "../auth.js";
import { API_BASE } from "../config.js";
import { parseScholarPage, parseResultCount } from "../util/html.js";
import { printTable, printJson, printError, printProgress } from "../output.js";
import type { Cookies } from "../auth.js";

interface LookupFlags {
  json: boolean;
  help: boolean;
}

function cookieHeader(cookies: Cookies): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
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
    printProgress("Searching Google Scholar...");

    const url = `${API_BASE}/scholar?q=${encodeURIComponent(query)}&hl=en`;
    const resp = await fetch(url, {
      headers: {
        Cookie: cookieHeader(cookies),
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });

    if (!resp.ok) {
      process.stderr.write("\r\x1b[K");
      printError(`Scholar returned ${resp.status} ${resp.statusText}`);
      return 1;
    }

    const html = await resp.text();
    process.stderr.write("\r\x1b[K");

    const results = parseScholarPage(html);
    const count = parseResultCount(html);

    if (results.length === 0) {
      printError("No results found.");
      return 1;
    }

    if (count) {
      console.error(count);
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
        console.log("");
      }
    }

    return 0;
  } catch (err) {
    process.stderr.write("\r\x1b[K");
    printError(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

function printLookupUsage(): void {
  console.log(`scholar lookup - Traditional Google Scholar keyword search

Usage: scholar lookup "query" [options]

Options:
  --json     Output as JSON
  --help     Show this help

Examples:
  scholar lookup "machine learning transformers"
  scholar lookup "author:hinton deep learning" --json`);
}
