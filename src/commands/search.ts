import { resolveCookies } from "../auth.js";
import { getXsrf, search } from "../api/scholar.js";
import { parseResultCard } from "../util/html.js";
import { printTable, printJson, printError, printProgress } from "../output.js";
import type { ScholarResult } from "../util/html.js";

interface SearchFlags {
  json: boolean;
  interactive: boolean;
  help: boolean;
}

export async function cmdSearch(
  args: string[],
  flags: SearchFlags,
): Promise<number> {
  if (flags.help) {
    printSearchUsage();
    return 0;
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
    const cookies = resolveCookies();
    const xsrf = await getXsrf(cookies);

    const results: ScholarResult[] = [];

    await search({
      query,
      cookies,
      xsrf,
      onProgress: (status) => {
        printProgress(status);
      },
      onResult: (html, position) => {
        results.push(parseResultCard(html, position));
      },
    });

    // Clear progress line
    process.stderr.write("\r\x1b[K");

    if (results.length === 0) {
      printError("No results found.");
      return 1;
    }

    // Sort by position
    results.sort((a, b) => a.position - b.position);

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

async function interactiveSearch(flags: SearchFlags): Promise<number> {
  try {
    const cookies = resolveCookies();
    const xsrf = await getXsrf(cookies);
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

      const results: ScholarResult[] = [];

      const response = await search({
        query: input,
        cookies,
        xsrf,
        sessionId,
        onProgress: (status) => {
          printProgress(status);
        },
        onResult: (html, position) => {
          results.push(parseResultCard(html, position));
        },
      });

      sessionId = response.sessionId;
      process.stderr.write("\r\x1b[K");

      if (results.length === 0) {
        console.error("No results found.\n");
        continue;
      }

      results.sort((a, b) => a.position - b.position);

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
    return 1;
  }
}

function printSearchUsage(): void {
  console.log(`scholar search - Google Scholar Labs AI-enhanced search

Usage: scholar search "question" [options]

Options:
  --json          Output as JSON
  --interactive   Interactive REPL mode with follow-up questions
  --help          Show this help

Examples:
  scholar search "what are the key papers on attention mechanisms"
  scholar search "compare BERT and GPT architectures" --json
  scholar search --interactive`);
}
