# scholar - Google Scholar CLI

A zero-dependency CLI for searching Google Scholar, fetching citations, and downloading papers. Built with Bun/TypeScript, compiles to a single binary.

## Features

- **Search** — Google Scholar Labs AI-enhanced search with streaming progress
- **Lookup** — Traditional Google Scholar keyword search
- **Cite** — Fetch BibTeX citations by cluster ID
- **Download** — Download PDFs with redirect-following and cookie forwarding
- **Auth** — Extract Google session cookies from a running Chrome instance via CDP
- **Institutional access** — Library link resolver support (UVa, NYU, etc.) with domain-aware cookie handling

## Install

```bash
bun install
bun run build    # compiles to ./scholar
```

Requires [Bun](https://bun.sh) to build. The compiled binary runs standalone without Bun.

## Setup

### 1. Launch Chrome with remote debugging

Use a dedicated profile so automation never steals focus from your primary browser:

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9250 --user-data-dir="$HOME/.config/chrome-cdp"

# Linux
chromium --remote-debugging-port=9250 --user-data-dir="$HOME/.config/chrome-cdp"
```

Port 9250 is the default the CLI targets. A Chrome on port 9222 is typically running
your default profile — driving that one steals focus.

### 2. Sign into Google in Chrome

Navigate to [scholar.google.com](https://scholar.google.com) and ensure you're signed in.

### 3. (Optional) Configure library links

Go to [Scholar Settings > Library links](https://scholar.google.com/scholar_settings#2) and add your university. This enables institutional access links in search results.

### 4. Authenticate

```bash
scholar auth                # default port 9250
scholar auth --port 9333    # custom CDP port

# Or set the port for every invocation:
export SCHOLAR_CDP_PORT=9333   # this CLI only
export CDP_PORT=9333           # shared with other CLIs following this convention
```

This extracts Google session cookies and saves them to `~/.google-scholar/`. If you configured library links, the institutional ID is also saved.

## Usage

### Search (Labs AI-enhanced)

```bash
scholar search "what are the key papers on attention mechanisms"
scholar search "compare BERT and GPT" --json
scholar search "attention is all you need" --bibtex
scholar search "transformer architectures" --download
scholar search --interactive
```

### Lookup (traditional keyword search)

```bash
scholar lookup "fama french three factor model"
scholar lookup "machine learning" --json
scholar lookup "asset pricing" --bibtex
scholar lookup "deep learning" --download
```

### Cite (BibTeX by cluster ID)

```bash
scholar cite 5Gohgn6QFikJ
scholar cite 5Gohgn6QFikJ 8409835334886051453 --json
```

### Download (single PDF)

```bash
scholar download "https://arxiv.org/pdf/1706.03762" --output attention.pdf
```

## Flags

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |
| `--bibtex` | Fetch BibTeX citations (with abstracts injected) |
| `--download` | Download PDFs for results with full-text links |
| `--interactive` | Interactive REPL mode for search |
| `--limit <n>` | Keep only the first n results (search/lookup) |
| `--port <n>` | Chrome CDP port (default: 9250) |
| `--output <path>` | Output file path for download (default: paper.pdf) |
| `--help` | Show help |

## Exit codes

Auth-shaped failures use [sysexits](https://man.freebsd.org/cgi/man.cgi?sysexits) codes so
cron jobs and scripts can branch without grepping stderr. This taxonomy is a shared
convention with `consensus-cli`.

| Code | Name | Meaning | Retry? |
|------|------|---------|--------|
| 0 | OK | Success | — |
| 69 | UNAVAILABLE | Chrome not reachable on the CDP port | after starting Chrome |
| 75 | TEMPFAIL | CAPTCHA or rate limit — needs a human in the browser | after solving it |
| 77 | NOPERM | Not signed in to Google in that Chrome | after signing in |
| 1 | — | Anything else, including a Scholar layout change (a code bug) | no |

`search` self-heals a stale cookie snapshot once: if Chrome is reachable, it re-extracts
cookies, prints `session was stale; refreshed cookies from Chrome on :9250` to stderr, and
retries a single time. CAPTCHAs and 5xx are never retried automatically.

## How it works

- **Auth**: Connects to Chrome via CDP WebSocket, extracts all cookies (Google auth + scholarly domains), saves to `~/.google-scholar/` via atomic tmp-file + rename, so concurrent runs can't tear the snapshot. Port precedence: `--port` > `$SCHOLAR_CDP_PORT` > `$CDP_PORT` > 9250
- **Search**: Fetches XSRF token from Scholar Labs page, POSTs query, parses binary-framed streaming response (4-byte BE uint32 length + JSON payload)
- **Lookup**: Standard GET to `/scholar?q=...`, parses full result page HTML
- **Download**: Follows HTTP redirects manually with domain-appropriate cookies. Handles Scholar instlink JS redirects for institutional access. Validates Content-Type to reject HTML paywall pages.
- **BibTeX**: Two-step fetch — gets citation popup HTML, extracts BibTeX URL, fetches raw BibTeX. Injects snippet as abstract field.

## File structure

```
~/.google-scholar/
├── cookies           # Google auth cookies (JSON, mode 0600)
├── browser-cookies   # All scholarly domain cookies (JSON, mode 0600)
└── inst              # Institutional library ID (plaintext, mode 0600)
```
