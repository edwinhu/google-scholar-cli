# Learnings

## Test Output

### Unit + CLI Integration Tests (bun test)

```
bun test v1.3.5 (1e86cebd)

 44 pass
 0 fail
 144 expect() calls
Ran 44 tests across 5 files. [142.00ms]
```

Test files:
- `tests/flags.test.ts` - 13 tests (flag parsing, positional args, config exports)
- `tests/parser.test.ts` - 14 tests (binary frame parsing, streaming parser)
- `tests/html.test.ts` - 12 tests (HTML card extraction with real Scholar HTML)
- `tests/cli.test.ts` - 4 tests (subprocess integration: --help, help, unknown-cmd, search without query)
- `tests/placeholder.test.ts` - 1 test (placeholder)

### Compiled Binary Smoke Test

```
$ ./scholar --help
scholar - Google Scholar CLI

Usage: scholar <command> [options]

Commands:
  auth          Authenticate via Chrome CDP cookie extraction
  search        Search Google Scholar Labs API
  help          Show this help

Global Flags:
  --json             Output as JSON
  --port <n>         Chrome CDP port (default: 9222)
  --interactive      Interactive REPL mode for search
  --help             Show help

$ ./scholar search
error: No query provided. Usage: scholar search "your question"
EXIT: 1
```

Binary compiled successfully: 60MB standalone binary (bun build --compile).

## Implementation Notes

- TDD enforced: tests written first (RED), implementation second (GREEN)
- Zero runtime dependencies (Bun native)
- Mirrors readwise-cli patterns: flag parser, auth cascade, output formatting
- Binary-framed protocol parser handles streaming and one-shot modes
- HTML parser uses regex extraction (zero deps, handles real Scholar HTML)
- CDP auth connects to existing Chrome (doesn't launch)
---
Last updated: 2026-02-13 19:00
---

[Compaction at 19:08] (workflow: /dev) - Context was summarized
---
Last updated: 2026-02-13 21:31
---

[Compaction at 21:35] (workflow: /dev) - Context was summarized
