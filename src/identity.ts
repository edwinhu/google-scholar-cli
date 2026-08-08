import { existsSync, readFileSync } from "node:fs";
import { UA_FILE } from "./config.js";
import { writeFileAtomic } from "./auth.js";

/**
 * The browser identity the session cookies belong to.
 *
 * Captured at `scholar auth` time from the same Chrome the cookies come from,
 * so the invariant "our headers describe the browser that owns these cookies"
 * holds by construction instead of by a hardcoded constant that rots on every
 * Chrome release and is wrong on whichever platform you aren't on.
 */
export interface BrowserIdentity {
  userAgent: string;
  /** Unquoted sec-ch-ua-platform token, e.g. "Linux" or "macOS". */
  platform: string;
  /** Rendered sec-ch-ua value, e.g. '"Chromium";v="150", "Not)A;Brand";v="24"'. */
  brands: string;
}

/**
 * Used only until the first `scholar auth` under this version writes a real
 * one — older installs keep working with the values that shipped before.
 */
export const FALLBACK_IDENTITY: BrowserIdentity = {
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  platform: "macOS",
  brands: '"Chromium";v="149", "Not)A;Brand";v="24"',
};

/** A brand entry as reported by navigator.userAgentData.brands. */
export interface UaBrand {
  brand: string;
  version: string;
}

export interface UaData {
  platform?: string | null;
  brands?: UaBrand[] | null;
}

/** sec-ch-ua-platform token implied by a UA string. */
function platformFromUserAgent(ua: string): string {
  if (/Macintosh|Mac OS X/.test(ua)) return "macOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Android/.test(ua)) return "Android";
  if (/X11|Linux/.test(ua)) return "Linux";
  return "Unknown";
}

/** Render brands into the sec-ch-ua header format. */
function renderBrands(brands: UaBrand[]): string {
  return brands.map((b) => `"${b.brand}";v="${b.version}"`).join(", ");
}

/** sec-ch-ua implied by a UA string, when the browser won't tell us directly. */
function brandsFromUserAgent(ua: string): string {
  const major = ua.match(/Chrome\/(\d+)/)?.[1];
  return major
    ? `"Chromium";v="${major}", "Not)A;Brand";v="24"`
    : FALLBACK_IDENTITY.brands;
}

/**
 * Build an identity from what the browser reported.
 *
 * navigator.userAgentData is preferred but is NOT reliable: plain Chromium
 * builds report an empty platform and an empty brands list (verified on
 * Chromium 150 — getHighEntropyValues returns empties too). Whenever it comes
 * back blank, both fields are derived from the UA string, which is always
 * present. Either way every field describes the same browser.
 */
export function deriveIdentity(userAgent: string, uaData?: UaData): BrowserIdentity {
  const platform = uaData?.platform || platformFromUserAgent(userAgent);
  const brands =
    uaData?.brands && uaData.brands.length > 0
      ? renderBrands(uaData.brands)
      : brandsFromUserAgent(userAgent);
  return { userAgent, platform, brands };
}

function isIdentity(value: unknown): value is BrowserIdentity {
  const v = value as Record<string, unknown>;
  return (
    !!v &&
    typeof v.userAgent === "string" &&
    v.userAgent.length > 0 &&
    typeof v.platform === "string" &&
    typeof v.brands === "string"
  );
}

let cached: BrowserIdentity | null = null;

/**
 * The stored identity, or the shipped fallback when no `scholar auth` has run
 * under this version yet (or the file is unreadable).
 */
export function loadIdentity(): BrowserIdentity {
  if (cached) return cached;
  if (existsSync(UA_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(UA_FILE, "utf-8"));
      if (isIdentity(parsed)) {
        cached = parsed;
        return cached;
      }
    } catch {
      // fall through to the fallback below
    }
  }
  return FALLBACK_IDENTITY;
}

/** Persist the identity alongside the cookie snapshot, atomically. */
export function saveIdentity(identity: BrowserIdentity): void {
  writeFileAtomic(UA_FILE, JSON.stringify(identity, null, 2));
  cached = identity;
}

/** Drop the in-process cache (tests, and after an external refresh). */
export function resetIdentityCache(): void {
  cached = null;
}

/** UA + client hints, sent with every Scholar request. */
export function browserHeaders(): Record<string, string> {
  const id = loadIdentity();
  return {
    "User-Agent": id.userAgent,
    "sec-ch-ua": id.brands,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": `"${id.platform}"`,
  };
}

/**
 * Headers for top-level navigations (the HTML /scholar scrape page) — what a
 * real Chrome adds when loading a document. /scholar?q= is the most heavily
 * bot-policed Scholar surface, so matching a real browser matters most here.
 */
export function navHeaders(): Record<string, string> {
  return {
    ...browserHeaders(),
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
  };
}

/** The User-Agent belonging to the stored session. */
export function userAgent(): string {
  return loadIdentity().userAgent;
}
