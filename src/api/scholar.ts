import { API_BASE, SEARCH_PATH, USER_AGENT } from "../config.js";
import { cdpPort, notSignedIn, blocked } from "../cdp.js";
import { createFrameParser } from "../util/parser.js";
import { extractBibtexUrl } from "../util/bibtex.js";
import type { Cookies, BrowserCookie } from "../auth.js";
import { cookiesForUrl } from "../auth.js";

export interface SearchOptions {
  query: string;
  cookies: Cookies;
  xsrf: string;
  sessionId?: string; // undefined for new session, string for follow-up
  onProgress?: (status: string) => void;
  onResult?: (html: string, position: number) => void;
}

export interface SearchResponse {
  sessionId: string;
  messages: unknown[]; // all parsed StreamMessages
}

/**
 * Format cookies object as a Cookie header value.
 */
function cookieHeader(cookies: Cookies): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

export const SERVICE = "Google Scholar";

/**
 * Signals that the Labs page loaded but carried no XSRF token. Distinct from
 * AuthError on purpose: this is a code bug (Scholar's layout changed), not an
 * auth problem, so it must never be reported as NOPERM. It is self-healable
 * once, since a partly-valid session produces the same symptom.
 */
export class MissingTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingTokenError";
  }
}

/**
 * Whether a response landed on Google's sign-in flow. Scholar Labs (unlike
 * /scholar) requires a signed-in session and 302s to accounts.google.com when
 * the cookies are expired or absent. Detected by the post-redirect host only:
 * a genuine Scholar page also contains ServiceLogin links, so HTML markers
 * would produce false positives.
 */
export function isSignInRedirect(finalUrl: string): boolean {
  try {
    return new URL(finalUrl).hostname === "accounts.google.com";
  } catch {
    return false;
  }
}

/**
 * Fetch the XSRF token from the Scholar Labs search page.
 * Extracts data-dsp attribute from #gs_as_glb element.
 */
export async function getXsrf(cookies: Cookies): Promise<string> {
  const url = `${API_BASE}${SEARCH_PATH}`;
  const resp = await fetch(url, {
    headers: {
      Cookie: cookieHeader(cookies),
      "User-Agent": USER_AGENT,
    },
  });

  if (isSignInRedirect(resp.url)) {
    throw notSignedIn(SERVICE, cdpPort());
  }

  if (!resp.ok) {
    throw new Error(
      `Failed to fetch XSRF token: ${resp.status} ${resp.statusText}`,
    );
  }

  const html = await resp.text();
  if (html.includes("gs_captcha")) {
    throw blocked(SERVICE, cdpPort());
  }
  const match = html.match(/data-dsp="[^"]*xsrf=([^"&]*)"/);
  if (!match) {
    throw new MissingTokenError(
      "Scholar Labs page loaded but contained no XSRF token. Most likely the " +
        `session is stale — re-authenticate with 'scholar auth --port ${cdpPort()}' and retry. ` +
        "If that doesn't help, Scholar's page layout has changed and the token scrape needs updating.",
    );
  }

  return match[1];
}

/**
 * Execute a Scholar Labs search query.
 * Returns all parsed streaming messages and the session ID.
 */
export async function search(opts: SearchOptions): Promise<SearchResponse> {
  const path = opts.sessionId
    ? `${SEARCH_PATH}/session_data/${opts.sessionId}`
    : `${SEARCH_PATH}/session_data`;

  const url = `${API_BASE}${path}?hl=en&xsrf=${opts.xsrf}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(opts.cookies),
      "User-Agent": USER_AGENT,
    },
    body: `q=${encodeURIComponent(opts.query)}`,
  });

  if (!resp.ok) {
    throw new Error(
      `Scholar API error: ${resp.status} ${resp.statusText}`,
    );
  }

  if (!resp.body) {
    throw new Error("No response body from Scholar API");
  }

  const parser = createFrameParser();
  const reader = resp.body.getReader();
  const allMessages: unknown[] = [];
  let sessionId = opts.sessionId || "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const messages = parser.push(value);
    for (const msg of messages) {
      allMessages.push(msg);

      // Extract session ID from first message
      const m = msg as Record<string, unknown>;
      if (m.i && typeof m.i === "string" && !sessionId) {
        sessionId = m.i;
      }

      // Report progress from turns
      if (Array.isArray(m.t)) {
        for (const turn of m.t) {
          const t = turn as Record<string, unknown>;
          if (t.s && typeof t.s === "string" && opts.onProgress) {
            opts.onProgress(t.s);
          }
          // Report individual results
          if (Array.isArray(t.f) && opts.onResult) {
            for (const finding of t.f) {
              const f = finding as Record<string, unknown>;
              if (typeof f.h === "string" && typeof f.i === "number") {
                opts.onResult(f.h, f.i);
              }
            }
          }
        }
      }

      // Handle individual result messages (later in stream)
      if (
        typeof m.h === "string" &&
        typeof m.i === "number" &&
        opts.onResult
      ) {
        opts.onResult(m.h, m.i as number);
      }
    }
  }

  const remaining = parser.flush();
  for (const msg of remaining) {
    allMessages.push(msg);
  }

  return { sessionId, messages: allMessages };
}

/**
 * Fetch the BibTeX citation for a Scholar result by its cluster ID.
 *
 * This is a two-step process:
 * 1. GET the citation popup HTML from Scholar
 * 2. Extract the BibTeX URL from the popup and fetch the raw BibTeX string
 */
export async function fetchBibtex(
  clusterId: string,
  cookies: Cookies,
): Promise<string> {
  const headers = {
    Cookie: cookieHeader(cookies),
    "User-Agent": USER_AGENT,
  };

  // Step 1: Get the citation popup HTML
  const citeUrl = `${API_BASE}/scholar?q=info:${encodeURIComponent(clusterId)}:scholar.google.com/&output=cite`;
  const citeResp = await fetch(citeUrl, { headers });

  if (!citeResp.ok) {
    throw new Error(
      `Failed to fetch citation popup for ${clusterId}: ${citeResp.status} ${citeResp.statusText}`,
    );
  }

  const citeHtml = await citeResp.text();
  if (citeHtml.includes("gs_captcha")) {
    throw new Error(
      "Google Scholar returned a CAPTCHA. Open scholar.google.com in Chrome, solve it, then retry.",
    );
  }
  const bibtexUrl = extractBibtexUrl(citeHtml);

  if (!bibtexUrl) {
    throw new Error(
      `Could not find BibTeX link in citation popup for cluster ID ${clusterId}`,
    );
  }

  // Step 2: Fetch the actual BibTeX string
  const bibResp = await fetch(bibtexUrl, { headers });

  if (!bibResp.ok) {
    throw new Error(
      `Failed to fetch BibTeX for ${clusterId}: ${bibResp.status} ${bibResp.statusText}`,
    );
  }

  return bibResp.text();
}

/**
 * Download a PDF from a URL (LibKey, direct PDF, etc.) following redirects.
 *
 * When allCookies is provided, manually follows redirects and sends
 * domain-appropriate cookies at each hop (e.g., libkey.io cookies for
 * libkey.io, proxy cookies for proxy domains, publisher cookies for
 * publisher domains).
 *
 * Falls back to Google cookies when allCookies is not provided.
 */
export async function downloadPdf(
  url: string,
  outputPath: string,
  cookies: Cookies,
  allCookies?: BrowserCookie[],
): Promise<void> {
  let currentUrl = url;
  const maxRedirects = 10;

  for (let i = 0; i < maxRedirects; i++) {
    // Build cookie header: use domain-matched browser cookies if available,
    // fall back to Google cookies
    let cookieStr: string;
    if (allCookies && allCookies.length > 0) {
      const matched = cookiesForUrl(allCookies, currentUrl);
      cookieStr = matched || cookieHeader(cookies);
    } else {
      cookieStr = cookieHeader(cookies);
    }

    const resp = await fetch(currentUrl, {
      headers: {
        Cookie: cookieStr,
        "User-Agent": USER_AGENT,
      },
      redirect: "manual", // Don't auto-follow — we handle it
    });

    // Follow redirects manually
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get("location");
      if (!location) {
        throw new Error(`Redirect ${resp.status} with no Location header`);
      }
      // Resolve relative URLs
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!resp.ok) {
      throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
    }

    // Check Content-Type: reject HTML responses (likely a paywall or login page)
    const contentType = resp.headers.get("content-type") ?? "";
    if (contentType.split(";")[0].trim().toLowerCase() === "text/html") {
      // Check if this is a Scholar instlink redirect page (JS-based redirect)
      const html = await resp.text();
      const jsRedirect = html.match(/location\.replace\(['"]([^'"]+)['"]\)/);
      if (jsRedirect) {
        currentUrl = jsRedirect[1];
        continue; // Follow the JS redirect
      }
      throw new Error(
        "Server returned HTML instead of PDF (likely a paywall or login page)",
      );
    }

    const buffer = await resp.arrayBuffer();
    await Bun.write(outputPath, buffer);
    return;
  }

  throw new Error(`Too many redirects (>${maxRedirects})`);
}
