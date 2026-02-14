import { printError } from "./output.js";

// Parse global flags from argv
export function parseFlags(argv: string[]): {
  args: string[];
  flags: Record<string, string | boolean>;
} {
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};

  let i = 0;
  while (i < argv.length) {
    const a = argv[i];

    if (a === "--") {
      args.push(...argv.slice(i + 1));
      break;
    }

    if (a.startsWith("--")) {
      const key = a.slice(2);
      // Check if next arg is a value (not another flag)
      if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        flags[key] = argv[i + 1];
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
    } else {
      args.push(a);
      i++;
    }
  }

  return { args, flags };
}

async function main(): Promise<number> {
  // Skip bun and script path
  const rawArgs = Bun.argv.slice(2);
  const { args, flags } = parseFlags(rawArgs);

  // Global flags
  const globalFlags = {
    json: !!flags.json,
    port: typeof flags.port === "string" ? parseInt(flags.port, 10) : undefined,
    interactive: !!flags.interactive,
    help: !!flags.help,
    bibtex: !!flags.bibtex,
    download: !!flags.download,
    output: typeof flags.output === "string" ? flags.output : undefined,
  };

  const cmd = args[0];
  const cmdArgs = args.slice(1);

  if (!cmd || cmd === "help" || (globalFlags.help && !cmd)) {
    printUsage();
    return 0;
  }

  switch (cmd) {
    case "auth": {
      const { cmdAuth } = await import("./commands/auth.js");
      return cmdAuth(cmdArgs, globalFlags);
    }
    case "search": {
      const { cmdSearch } = await import("./commands/search.js");
      return cmdSearch(cmdArgs, globalFlags);
    }
    case "lookup": {
      const { cmdLookup } = await import("./commands/lookup.js");
      return cmdLookup(cmdArgs, globalFlags);
    }
    case "cite": {
      const { cmdCite } = await import("./commands/cite.js");
      return cmdCite(cmdArgs, globalFlags);
    }
    case "download": {
      const { cmdDownload } = await import("./commands/download.js");
      return cmdDownload(cmdArgs, globalFlags);
    }
    default:
      printError(`Unknown command: ${cmd}`);
      printUsage();
      return 1;
  }
}

function printUsage(): void {
  console.log(`scholar - Google Scholar CLI

Usage: scholar <command> [options]

Commands:
  auth          Authenticate via Chrome CDP cookie extraction
  search        Search Google Scholar Labs (AI-enhanced)
  lookup        Traditional Google Scholar keyword search
  cite          Fetch BibTeX citations by cluster ID
  download      Download a PDF from a URL (LibKey, direct link, etc.)
  help          Show this help

Global Flags:
  --json             Output as JSON
  --port <n>         Chrome CDP port (default: 9222)
  --interactive      Interactive REPL mode for search
  --bibtex           Fetch BibTeX citations for search/lookup results
  --download         Download PDFs for results with full-text links
  --help             Show help`);
}

if (import.meta.main) {
  main().then((code) => process.exit(code));
}
