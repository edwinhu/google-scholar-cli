/**
 * Chrome DevTools Protocol (CDP) module.
 *
 * Port precedence: --port flag > SCHOLAR_CDP_PORT > CDP_PORT > 9250.
 * CDP_PORT is the cross-tool fallback: `export CDP_PORT=9250` configures every
 * CLI following this convention at once, while a tool-specific var still wins.
 *
 * The failure taxonomy below is a shared convention with consensus-cli — kept
 * verbatim-identical in both repos on purpose, and deliberately NOT a shared
 * library. Edit both or neither.
 */

import type { BrowserCookie } from "./auth.js";
import {
  deriveIdentity,
  FALLBACK_IDENTITY,
  type BrowserIdentity,
  type UaData,
} from "./identity.js";

// The default targets the dedicated automation profile
// (--user-data-dir=~/.config/chrome-cdp); port 9222 is a Chrome running on the
// default profile — the user's primary browser — and driving it steals focus.
export const DEFAULT_CDP_PORT = 9250;

function isValidPort(p: number | undefined): p is number {
  return typeof p === "number" && Number.isInteger(p) && p > 0 && p < 65536;
}

/** Read a port from an env var, ignoring unset/garbage/out-of-range values. */
function envPort(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const parsed = parseInt(raw, 10);
  return isValidPort(parsed) ? parsed : undefined;
}

/**
 * Resolve the CDP port. Precedence: --port flag > SCHOLAR_CDP_PORT > CDP_PORT
 * > default. Invalid values at any level fall through to the next.
 */
export function cdpPort(flagPort?: number): number {
  if (isValidPort(flagPort)) return flagPort;
  return (
    envPort("SCHOLAR_CDP_PORT") ?? envPort("CDP_PORT") ?? DEFAULT_CDP_PORT
  );
}

/** sysexits codes, so cron and scripts can branch without grepping stderr. */
export const EXIT = { OK: 0, UNAVAILABLE: 69, NOPERM: 77, TEMPFAIL: 75 } as const;

export class AuthError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** The browser itself isn't there. */
export function browserUnreachable(port: number): AuthError {
  return new AuthError(
    `Chrome not reachable on CDP port ${port}. Start Chrome with --remote-debugging-port=${port} (automation profile: ~/.config/chrome-cdp), then retry.`,
    EXIT.UNAVAILABLE,
  );
}

/** The browser is there, but has no usable session for the service. */
export function notSignedIn(service: string, port: number): AuthError {
  return new AuthError(
    `Not signed in to ${service} in the Chrome on CDP port ${port}. Sign in there, then retry.` +
      ` If you are signed in, refresh the local session with 'scholar auth --port ${port}'.`,
    EXIT.NOPERM,
  );
}

/** The service is refusing us for now — needs a human, never a retry. */
export function blocked(service: string, port: number): AuthError {
  return new AuthError(
    `${service} returned a CAPTCHA or rate limit. Solve it in Chrome on CDP port ${port}, then retry.`,
    EXIT.TEMPFAIL,
  );
}

/** Exit code for a caught error: an AuthError's own code, else 1. */
export function exitCodeFor(err: unknown): number {
  return err instanceof AuthError ? err.exitCode : 1;
}

/** Whether anything is listening on the CDP port. */
export async function cdpReachable(port: number): Promise<boolean> {
  const resp = await fetch(`http://127.0.0.1:${port}/json/list`).catch(
    () => null,
  );
  return !!resp && resp.ok;
}

interface CdpCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
}

export interface ExtractedCookies {
  googleCookies: Record<string, string>;
  allBrowserCookies: BrowserCookie[];
  /** Captured from the same browser, in the same call as the cookies. */
  identity: BrowserIdentity;
}

const SCHOLARLY_DOMAINS = [
  // Google
  "google.com", "google.dev", "googleapis.com",
  // Scholar tools
  "scholar.google.com", "paperpile.com", "zotero.org",
  "mendeley.com", "semanticscholar.org",
  // LibKey / Third Iron
  "libkey.io", "thirdiron.com",
  // Auth providers
  "openathens.net", "shibboleth",
  // Publishers
  "elsevier.com", "sciencedirect.com", "springer.com",
  "springerlink.com", "wiley.com", "tandfonline.com",
  "jstor.org", "sagepub.com", "ieee.org", "acm.org",
  "oup.com", "cambridge.org", "nature.com", "science.org",
  "pnas.org", "nih.gov", "ncbi.nlm.nih.gov", "pubmed",
  "doi.org", "crossref.org", "arxiv.org", "biorxiv.org",
  "medrxiv.org", "ssrn.com", "researchgate.net",
  "academia.edu", "heinonline.org",
  // Proxies / institutional
  "ebsco", "proquest", "westlaw", "thomsonreuters",
];

function isScholarlyDomain(domain: string): boolean {
  const d = domain.replace(/^\./, "").toLowerCase();
  // .edu domains are always scholarly
  if (d.endsWith(".edu")) return true;
  return SCHOLARLY_DOMAINS.some((sd) => d === sd || d.endsWith("." + sd));
}

// Google auth cookies kept in the Google-only snapshot (backward compat)
const RELEVANT_GOOGLE_COOKIES = new Set([
  "SID",
  "SSID",
  "HSID",
  "SAPISID",
  "APISID",
  "SIDCC",
  "__Secure-1PSID",
  "__Secure-3PSID",
  "__Secure-1PAPISID",
  "__Secure-3PAPISID",
  "NID",
  "1P_JAR",
]);

/**
 * Extract cookies from the Chrome running on `port` via CDP.
 *
 * Shared by `scholar auth` and the search self-heal path so both refresh the
 * snapshot identically. Throws AuthError (never a bare fetch/WebSocket error)
 * so callers can map failures to exit codes.
 */
export async function extractCookies(port: number): Promise<ExtractedCookies> {
  const listResp = await fetch(`http://127.0.0.1:${port}/json/list`).catch(
    () => null,
  );
  if (!listResp || !listResp.ok) {
    throw browserUnreachable(port);
  }

  const pages = (await listResp.json()) as Array<{
    webSocketDebuggerUrl: string;
    url: string;
  }>;

  const googlePage = pages.find((p) => p.url.includes("google.com")) || pages[0];
  if (!googlePage?.webSocketDebuggerUrl) {
    throw browserUnreachable(port);
  }

  const ws = new WebSocket(googlePage.webSocketDebuggerUrl);

  // Cookies (id 1) and the browser's own UA client hints (id 2) come from the
  // same socket on the same browser, so they can never describe different ones.
  const { cdpCookies, uaData } = await new Promise<{
    cdpCookies: CdpCookie[];
    uaData: UaData | undefined;
  }>((resolve, reject) => {
    let cookies: CdpCookie[] | null = null;
    let hints: UaData | undefined;
    let hintsDone = false;

    const settle = () => {
      if (!cookies || !hintsDone) return;
      clearTimeout(timeout);
      ws.close();
      resolve({ cdpCookies: cookies, uaData: hints });
    };

    const timeout = setTimeout(() => {
      ws.close();
      reject(new AuthError(`CDP timeout after 10s on port ${port}`, EXIT.UNAVAILABLE));
    }, 10_000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, method: "Network.getAllCookies" }));
      ws.send(
        JSON.stringify({
          id: 2,
          method: "Runtime.evaluate",
          params: {
            expression: `JSON.stringify({platform: navigator.userAgentData?.platform ?? null, brands: navigator.userAgentData?.brands ?? null})`,
            returnByValue: true,
          },
        }),
      );
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(String(event.data));

      if (data.id === 1) {
        if (data.error) {
          clearTimeout(timeout);
          ws.close();
          reject(new AuthError(`CDP error: ${data.error.message}`, EXIT.UNAVAILABLE));
          return;
        }
        cookies = data.result.cookies as CdpCookie[];
        settle();
        return;
      }

      if (data.id === 2) {
        // Best-effort: plain Chromium reports empty hints, and a restricted
        // page can fail the eval outright. deriveIdentity falls back to the
        // UA string in both cases, so this never blocks auth.
        try {
          hints = JSON.parse(data.result?.result?.value) as UaData;
        } catch {
          hints = undefined;
        }
        hintsDone = true;
        settle();
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(new AuthError(`WebSocket error: ${err}`, EXIT.UNAVAILABLE));
    };
  });

  // The browser's own UA, straight from the CDP endpoint — present even when
  // the browser has no usable page target.
  const versionResp = await fetch(`http://127.0.0.1:${port}/json/version`).catch(
    () => null,
  );
  const browserUserAgent = versionResp?.ok
    ? ((await versionResp.json()) as { "User-Agent"?: string })["User-Agent"]
    : undefined;
  const identity = deriveIdentity(
    browserUserAgent || FALLBACK_IDENTITY.userAgent,
    uaData,
  );

  const allBrowserCookies: BrowserCookie[] = cdpCookies
    .filter((c) => isScholarlyDomain(c.domain))
    .map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
    }));

  const googleCookies: Record<string, string> = {};
  for (const cookie of cdpCookies) {
    if (
      cookie.domain.includes("google.com") &&
      (RELEVANT_GOOGLE_COOKIES.has(cookie.name) ||
        cookie.name.startsWith("__Secure-"))
    ) {
      googleCookies[cookie.name] = cookie.value;
    }
  }

  if (Object.keys(googleCookies).length === 0) {
    throw notSignedIn("Google Scholar", port);
  }

  return { googleCookies, allBrowserCookies, identity };
}
