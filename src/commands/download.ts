import { resolveCookies, resolveAllCookies } from "../auth.js";
import { downloadPdf } from "../api/scholar.js";
import { printError } from "../output.js";

interface DownloadFlags {
  json: boolean;
  help: boolean;
  output?: string;
}

export async function cmdDownload(
  args: string[],
  flags: DownloadFlags,
): Promise<number> {
  if (flags.help) {
    printDownloadUsage();
    return 0;
  }

  const url = args[0];

  if (!url) {
    printError('No URL provided. Usage: scholar download <url> [--output <path>]');
    return 1;
  }

  const outputPath =
    typeof flags.output === "string" ? flags.output : "paper.pdf";

  try {
    const cookies = resolveCookies();
    const allCookies = resolveAllCookies();
    process.stderr.write(`Downloading ${url}...\n`);
    await downloadPdf(url, outputPath, cookies, allCookies);
    console.log(outputPath);
    return 0;
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

function printDownloadUsage(): void {
  console.log(`scholar download - Download a PDF from a URL

Usage: scholar download <url> [options]

Options:
  --output <path>  Output file path (default: paper.pdf)
  --help           Show this help

Examples:
  scholar download "https://libkey.io/libraries/1234/openurl?genre=article&doi=10.1234/example"
  scholar download "https://example.com/paper.pdf" --output my-paper.pdf`);
}
