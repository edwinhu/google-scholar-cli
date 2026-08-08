import { existsSync, readFileSync } from "node:fs";
import { mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { COOKIES_FILE, BROWSER_COOKIES_FILE, CONFIG_DIR } from "./config.js";

export interface Cookies {
  [key: string]: string; // cookie name → value
}

export interface BrowserCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
}

/**
 * Resolve cookies using cascade: flag → env → dotfile
 */
export function resolveCookies(flagCookies?: string): Cookies {
  // 1. Flag override (JSON string)
  if (flagCookies) {
    try {
      return JSON.parse(flagCookies);
    } catch {
      throw new Error("Invalid cookie JSON in --cookies flag");
    }
  }

  // 2. Environment variable
  const envCookies = process.env.GOOGLE_SCHOLAR_COOKIES;
  if (envCookies) {
    try {
      return JSON.parse(envCookies);
    } catch {
      throw new Error("Invalid cookie JSON in GOOGLE_SCHOLAR_COOKIES env var");
    }
  }

  // 3. Dotfile
  if (existsSync(COOKIES_FILE)) {
    const content = readFileSync(COOKIES_FILE, "utf-8");
    try {
      return JSON.parse(content);
    } catch {
      throw new Error(
        `Corrupted cookie file at ${COOKIES_FILE}. Run 'scholar auth' to re-authenticate.`,
      );
    }
  }

  throw new Error("No cookies found. Run 'scholar auth' first.");
}

/**
 * Write a snapshot file atomically: a reader either sees the whole old file or
 * the whole new one. Two concurrent `search` runs can now self-heal at once,
 * and a torn write would leave a corrupt cookie file behind.
 */
export function writeFileAtomic(path: string, data: string): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, data, { mode: 0o600 });
    renameSync(tmp, path);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // tmp file may not exist; nothing to clean up
    }
    throw err;
  }
}

/**
 * Save cookies to dotfile with 0600 permissions.
 */
export function saveCookies(cookies: Cookies): void {
  writeFileAtomic(COOKIES_FILE, JSON.stringify(cookies, null, 2));
}

/**
 * Save all browser cookies (from all domains) to browser-cookies file.
 */
export function saveAllCookies(cookies: BrowserCookie[]): void {
  writeFileAtomic(BROWSER_COOKIES_FILE, JSON.stringify(cookies, null, 2));
}

/**
 * Load all browser cookies from the browser-cookies file.
 * Returns an empty array if the file doesn't exist or is corrupted.
 */
export function resolveAllCookies(): BrowserCookie[] {
  if (existsSync(BROWSER_COOKIES_FILE)) {
    const content = readFileSync(BROWSER_COOKIES_FILE, "utf-8");
    try {
      return JSON.parse(content);
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Filter cookies that match a URL's domain and return as a Cookie header string.
 *
 * Domain matching follows browser conventions:
 * - ".google.com" matches "scholar.google.com" and "google.com"
 * - "google.com" matches exactly "google.com"
 */
export function cookiesForUrl(cookies: BrowserCookie[], url: string): string {
  const hostname = new URL(url).hostname;
  const matching = cookies.filter((c) => {
    // Normalize: ensure domain has leading dot for subdomain matching
    const dotDomain = c.domain.startsWith(".") ? c.domain : "." + c.domain;
    // Exact match: "example.com" === "example.com"
    if (hostname === c.domain) return true;
    // Bare domain matches leading-dot cookie: ".example.com" matches "example.com"
    if ("." + hostname === dotDomain) return true;
    // Subdomain match: ".google.com" matches "scholar.google.com"
    if (hostname.endsWith(dotDomain)) return true;
    return false;
  });
  return matching.map((c) => `${c.name}=${c.value}`).join("; ");
}
