import { resolveCookies } from "../auth.js";
import { printJson, printError, printProgress } from "../output.js";
import { fetchBibtex } from "../api/scholar.js";

interface CiteFlags {
  json: boolean;
  help: boolean;
}

export async function cmdCite(
  args: string[],
  flags: CiteFlags,
): Promise<number> {
  if (flags.help) {
    printCiteUsage();
    return 0;
  }

  if (args.length === 0) {
    printError(
      'No cluster ID provided. Usage: scholar cite <clusterId> [<clusterId2> ...]',
    );
    return 1;
  }

  try {
    const cookies = resolveCookies();
    const results: Array<{ clusterId: string; bibtex: string }> = [];

    for (const clusterId of args) {
      printProgress(`Fetching BibTeX for ${clusterId}...`);
      const bibtex = await fetchBibtex(clusterId, cookies);
      results.push({ clusterId, bibtex });
    }

    process.stderr.write("\r\x1b[K");

    if (flags.json) {
      printJson(results);
    } else {
      for (let i = 0; i < results.length; i++) {
        if (i > 0) console.log("");
        console.log(results[i].bibtex);
      }
    }

    return 0;
  } catch (err) {
    process.stderr.write("\r\x1b[K");
    printError(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

function printCiteUsage(): void {
  console.log(`scholar cite - Fetch BibTeX citations from Google Scholar

Usage: scholar cite <clusterId> [<clusterId2> ...] [options]

Options:
  --json     Output as JSON array of {clusterId, bibtex} objects
  --help     Show this help

Examples:
  scholar cite 12345678901234567
  scholar cite 12345678901234567 98765432109876543 --json`);
}
