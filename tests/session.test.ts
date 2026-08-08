import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import * as realAuth from "../src/auth.js";
import * as realCdp from "../src/cdp.js";
import * as realIdentity from "../src/identity.js";
import { AuthError, EXIT } from "../src/cdp.js";
import { MissingTokenError } from "../src/api/scholar.js";

// Counters for the mocked boundaries.
let saved = 0;
let extracted = 0;
let reachable = true;
let extractThrows: Error | null = null;
let cookieState = "stale";
let identitySaved = 0;

// Never write to the real ~/.google-scholar during tests.
mock.module("../src/auth.js", () => ({
  ...realAuth,
  // Stubbed rather than env-driven: GOOGLE_SCHOLAR_COOKIES deliberately
  // disables self-heal, which is its own test below.
  resolveCookies: () => ({ SID: cookieState }),
  saveCookies: () => {
    saved++;
  },
  saveAllCookies: () => {},
}));

mock.module("../src/cdp.js", () => ({
  ...realCdp,
  cdpReachable: async () => reachable,
  extractCookies: async () => {
    extracted++;
    if (extractThrows) throw extractThrows;
    return {
      googleCookies: { SID: "fresh" },
      allBrowserCookies: [],
      identity: {
        userAgent: "UA/1.0",
        platform: "Linux",
        brands: '"Chromium";v="150"',
      },
    };
  },
}));

// Never write to the real ~/.google-scholar/ua either.
mock.module("../src/identity.js", () => ({
  ...realIdentity,
  saveIdentity: () => {
    identitySaved++;
  },
}));

const { openSession } = await import("../src/session.js");

const TOKEN = "AKLELW8AAAAAanjJR0UDmqv3uVQ2CgbPfm005n4";
const LABS_PAGE = `<div id="gs_as_glb" data-dsp="?hl=en&amp;xsrf=${TOKEN}"></div>`;
const SIGNIN_URL = "https://accounts.google.com/v3/signin/identifier";
const LABS_URL = "https://scholar.google.com/scholar_labs/search";

const realFetch = globalThis.fetch;
let fetchCalls = 0;
let stderrLines: string[] = [];
const realStderrWrite = process.stderr.write.bind(process.stderr);

/** Queue of [finalUrl, body, status] served in order to getXsrf. */
function serve(responses: Array<[string, string, number?]>): void {
  fetchCalls = 0;
  globalThis.fetch = (async () => {
    const [url, body, status] = responses[Math.min(fetchCalls, responses.length - 1)];
    fetchCalls++;
    const resp = new Response(body, { status: status ?? 200 });
    Object.defineProperty(resp, "url", { value: url });
    return resp;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  saved = 0;
  extracted = 0;
  reachable = true;
  extractThrows = null;
  cookieState = "stale";
  identitySaved = 0;
  stderrLines = [];
  delete process.env.GOOGLE_SCHOLAR_COOKIES;
  process.stderr.write = ((chunk: string) => {
    stderrLines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  process.stderr.write = realStderrWrite;
  delete process.env.GOOGLE_SCHOLAR_COOKIES;
});

describe("openSession self-heal", () => {
  it("refreshes cookies once and succeeds on the retry", async () => {
    serve([
      [SIGNIN_URL, "<html>sign in</html>"],
      [LABS_URL, LABS_PAGE],
    ]);

    const session = await openSession();

    expect(session.xsrf).toBe(TOKEN);
    expect(extracted).toBe(1);
    expect(saved).toBe(1);
    expect(identitySaved).toBe(1); // UA refreshed in the same step
    expect(fetchCalls).toBe(2);
  });

  it("announces the refresh on stderr — never silent", async () => {
    serve([
      [SIGNIN_URL, "<html>sign in</html>"],
      [LABS_URL, LABS_PAGE],
    ]);

    await openSession();

    expect(stderrLines.join("")).toContain(
      "session was stale; refreshed cookies from Chrome on :",
    );
  });

  it("retries at most once, then surfaces the auth error", async () => {
    serve([[SIGNIN_URL, "<html>sign in</html>"]]); // always signed out

    const err = await openSession().catch((e: Error) => e);

    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).exitCode).toBe(EXIT.NOPERM);
    expect(extracted).toBe(1); // exactly one refresh, not a loop
    expect(fetchCalls).toBe(2); // one original attempt + one retry
  });

  it("does NOT self-heal a CAPTCHA — that needs a human", async () => {
    serve([[LABS_URL, "<div id=gs_captcha></div>"]]);

    const err = await openSession().catch((e: Error) => e);

    expect((err as AuthError).exitCode).toBe(EXIT.TEMPFAIL);
    expect(extracted).toBe(0);
    expect(fetchCalls).toBe(1);
  });

  it("does NOT self-heal a 5xx", async () => {
    serve([[LABS_URL, "upstream boom", 503]]);

    const err = await openSession().catch((e: Error) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(AuthError);
    expect(extracted).toBe(0);
    expect(fetchCalls).toBe(1);
  });

  it("self-heals a missing token once, then keeps it at exit 1", async () => {
    serve([[LABS_URL, "<html>no token</html>"]]); // always tokenless

    const err = await openSession().catch((e: Error) => e);

    expect(err).toBeInstanceOf(MissingTokenError);
    expect(err).not.toBeInstanceOf(AuthError);
    expect(realCdp.exitCodeFor(err)).toBe(1);
    expect(extracted).toBe(1);
    expect(fetchCalls).toBe(2);
  });

  it("skips the refresh entirely when Chrome is unreachable", async () => {
    reachable = false;
    serve([[SIGNIN_URL, "<html>sign in</html>"]]);

    const err = await openSession().catch((e: Error) => e);

    expect((err as AuthError).exitCode).toBe(EXIT.NOPERM);
    expect(extracted).toBe(0);
    expect(fetchCalls).toBe(1);
  });

  it("does not self-heal when cookies come from GOOGLE_SCHOLAR_COOKIES", async () => {
    process.env.GOOGLE_SCHOLAR_COOKIES = JSON.stringify({ SID: "explicit" });
    serve([[SIGNIN_URL, "<html>sign in</html>"]]);

    const err = await openSession().catch((e: Error) => e);

    expect((err as AuthError).exitCode).toBe(EXIT.NOPERM);
    expect(extracted).toBe(0); // the override would win anyway
    expect(fetchCalls).toBe(1);
  });

  it("reports the original failure when the refresh itself fails", async () => {
    extractThrows = realCdp.browserUnreachable(9250);
    serve([[SIGNIN_URL, "<html>sign in</html>"]]);

    const err = await openSession().catch((e: Error) => e);

    expect((err as AuthError).exitCode).toBe(EXIT.NOPERM); // not 69
    expect(extracted).toBe(1);
  });
});
