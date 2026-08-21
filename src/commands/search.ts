import { existsSync } from "node:fs";
import { resolveAllCookies } from "../auth.js";
import type { Cookies, BrowserCookie } from "../auth.js";
import { search, fetchBibtex, downloadPdf } from "../api/scholar.js";
import { openSession } from "../session.js";
import { exitCodeFor } from "../cdp.js";
import { parseResultCard } from "../util/html.js";
import { injectAbstract } from "../util/bibtex.js";
import { sanitizeFilename } from "../util/filename.js";
import { applyLimit } from "../util/limit.js";
import { printTable, printJson, printError, printProgress } from "../output.js";
import type { ScholarResult, FullTextLink } from "../util/html.js";

interface SearchFlags {
  json: boolean;
  interactive: boolean;
  help: boolean;
  bibtex: boolean;
  download: boolean;
  limit?: number;
  journals?: string[];
}

export async function cmdSearch(
  args: string[],
  flags: SearchFlags,
): Promise<number> {
  if (flags.help) {
    printSearchUsage();
    return 0;
  }

  // Labs rewrites the question into its own queries, so a source: term is
  // swallowed and the filter silently does nothing. Refuse instead.
  if ((flags.journals ?? []).length > 0) {
    printError(
      "--journal is not supported by search: Scholar Labs rewrites the query " +
        "and ignores source: terms. Use `scholar lookup` for journal filtering.",
    );
    return 1;
  }

  const query = args.join(" ");

  if (!query && !flags.interactive) {
    printError('No query provided. Usage: scholar search "your question"');
    return 1;
  }

  if (flags.interactive) {
    return interactiveSearch(flags);
  }

  return oneShot(query, flags);
}

async function oneShot(query: string, flags: SearchFlags): Promise<number> {
  try {
    const { cookies, xsrf } = await openSession();

    const found: ScholarResult[] = [];

    await search({
      query,
      cookies,
      xsrf,
      onProgress: (status) => {
        printProgress(status);
      },
      onResult: (html, position) => {
        found.push(parseResultCard(html, position));
      },
    });

    // Clear progress line
    process.stderr.write("\r\x1b[K");

    if (found.length === 0) {
      printError("No results found.");
      return 1;
    }

    // Sort by position, then apply --limit
    found.sort((a, b) => a.position - b.position);
    const results = applyLimit(found, flags.limit);

    if (flags.bibtex) {
      return bibtexOutput(results, cookies, flags);
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

      // Print snippets below the table
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
      const allCookies = resolveAllCookies();
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
  flags: SearchFlags,
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

async function interactiveSearch(flags: SearchFlags): Promise<number> {
  try {
    const { cookies, xsrf } = await openSession();
    let sessionId: string | undefined;

    const readline = await import("node:readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr, // prompts go to stderr so stdout stays clean for results
    });

    console.error("Google Scholar Labs Search (interactive mode)");
    console.error("Type your question, or 'quit' to exit.\n");

    const askQuestion = (): Promise<string | null> => {
      return new Promise((resolve) => {
        rl.question(sessionId ? "follow-up> " : "scholar> ", (answer) => {
          resolve(answer || null);
        });
      });
    };

    while (true) {
      const input = await askQuestion();

      if (
        !input ||
        input.toLowerCase() === "quit" ||
        input.toLowerCase() === "exit"
      ) {
        rl.close();
        return 0;
      }

      const found: ScholarResult[] = [];

      const response = await search({
        query: input,
        cookies,
        xsrf,
        sessionId,
        onProgress: (status) => {
          printProgress(status);
        },
        onResult: (html, position) => {
          found.push(parseResultCard(html, position));
        },
      });

      sessionId = response.sessionId;
      process.stderr.write("\r\x1b[K");

      if (found.length === 0) {
        console.error("No results found.\n");
        continue;
      }

      found.sort((a, b) => a.position - b.position);
      const results = applyLimit(found, flags.limit);

      if (flags.json) {
        printJson(results);
      } else {
        const headers = ["#", "Title", "Authors", "Year", "Cited"];
        const rows = results.map((r) => [
          String(r.position + 1),
          r.title.length > 60 ? r.title.slice(0, 57) + "..." : r.title,
          r.authors.length > 30 ? r.authors.slice(0, 27) + "..." : r.authors,
          r.year,
          String(r.citations),
        ]);
        printTable(headers, rows);
      }
      console.log("");
    }
  } catch (err) {
    process.stderr.write("\r\x1b[K");
    printError(err instanceof Error ? err.message : String(err));
    return exitCodeFor(err);
  }
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

function printSearchUsage(): void {
  console.log(`scholar search - Google Scholar Labs AI-enhanced search

Usage: scholar search "question" [options]

Options:
  --json          Output as JSON
  --limit <n>     Keep only the first n results
  --bibtex        Fetch BibTeX citations for each result (with abstract)
  --download      Download PDFs for results with full-text links
  --interactive   Interactive REPL mode with follow-up questions
  --help          Show this help

Examples:
  scholar search "what are the key papers on attention mechanisms"
  scholar search "compare BERT and GPT architectures" --json
  scholar search "index fund ownership" --limit 3
  scholar search "attention is all you need" --bibtex
  scholar search "attention is all you need" --download
  scholar search --interactive`);
}
