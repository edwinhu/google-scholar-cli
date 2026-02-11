import { existsSync, readFileSync } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import { COOKIES_FILE, CONFIG_DIR } from "./config.js";

export interface Cookies {
  [key: string]: string; // cookie name → value
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
 * Save cookies to dotfile with 0600 permissions.
 */
export function saveCookies(cookies: Cookies): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2), {
    mode: 0o600,
  });
}
