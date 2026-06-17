import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = join(homedir(), ".google-scholar");
export const COOKIES_FILE = join(CONFIG_DIR, "cookies");
export const BROWSER_COOKIES_FILE = join(CONFIG_DIR, "browser-cookies");
export const INST_FILE = join(CONFIG_DIR, "inst");
export const API_BASE = "https://scholar.google.com";
export const SEARCH_PATH = "/scholar_labs/search";

// Full Chrome UA matching the browser the auth cookies are extracted from (Dia,
// Chromium 149 on macOS). A truncated UA paired with real-browser cookies is a
// bot signature that trips Scholar's CAPTCHA wall on the /scholar scrape path.
export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

// Client-hint + UA headers sent with every Scholar request so the request
// profile is consistent with the session's originating browser. Keep the
// sec-ch-ua brands in sync with USER_AGENT's Chrome major version.
export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  "sec-ch-ua": '"Chromium";v="149", "Not)A;Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
};

// Headers for top-level navigations (the HTML /scholar scrape page). These are
// the additional headers a real Chrome sends when loading a document, beyond the
// UA/client-hints above. The /scholar?q= endpoint is the most heavily bot-policed
// Scholar surface, so matching a real browser's header set here matters most.
export const NAV_HEADERS: Record<string, string> = {
  ...BROWSER_HEADERS,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
};
