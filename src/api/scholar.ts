import { API_BASE, SEARCH_PATH } from "../config.js";
import { createFrameParser } from "../util/parser.js";
import type { Cookies } from "../auth.js";

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

/**
 * Fetch the XSRF token from the Scholar Labs search page.
 * Extracts data-dsp attribute from #gs_as_glb element.
 */
export async function getXsrf(cookies: Cookies): Promise<string> {
  const url = `${API_BASE}${SEARCH_PATH}`;
  const resp = await fetch(url, {
    headers: {
      Cookie: cookieHeader(cookies),
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });

  if (!resp.ok) {
    throw new Error(
      `Failed to fetch XSRF token: ${resp.status} ${resp.statusText}`,
    );
  }

  const html = await resp.text();
  const match = html.match(/data-dsp="[^"]*xsrf=([^"&]*)"/);
  if (!match) {
    throw new Error("Could not extract XSRF token from page");
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
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
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
