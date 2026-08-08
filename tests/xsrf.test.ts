import { describe, it, expect, afterEach } from "bun:test";
import { getXsrf, isSignInRedirect, MissingTokenError } from "../src/api/scholar.js";
import { AuthError, EXIT } from "../src/cdp.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/**
 * Stub fetch with a fixed body and post-redirect URL. Response.url is
 * read-only, so it has to be redefined on the instance.
 */
function stubFetch(finalUrl: string, body: string): void {
  globalThis.fetch = (async () => {
    const resp = new Response(body, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    Object.defineProperty(resp, "url", { value: finalUrl });
    return resp;
  }) as unknown as typeof fetch;
}

// The real attribute as served by Scholar Labs, &amp;-escaped.
const LABS_PAGE = `<div id="gs_as_glb" data-dsp="?hl=en&amp;xsrf=AKLELW8AAAAAanjJR0UDmqv3uVQ2CgbPfm005n4"></div>`;

// A genuine Scholar page also links to ServiceLogin — the marker that must NOT
// be mistaken for a sign-in redirect.
const LABS_PAGE_WITH_LOGIN_LINK = `<a href="https://accounts.google.com/ServiceLogin?hl=en">Sign in</a>${LABS_PAGE}`;

describe("isSignInRedirect", () => {
  it("detects a redirect to the Google sign-in host", () => {
    expect(
      isSignInRedirect(
        "https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fscholar.google.com%2Fscholar_labs%2Fsearch",
      ),
    ).toBe(true);
  });

  it("does not fire for a Scholar URL", () => {
    expect(
      isSignInRedirect("https://scholar.google.com/scholar_labs/search"),
    ).toBe(false);
  });

  it("does not fire for a lookalike host", () => {
    expect(isSignInRedirect("https://accounts.google.com.evil.test/")).toBe(
      false,
    );
  });

  it("returns false for an unparseable URL", () => {
    expect(isSignInRedirect("")).toBe(false);
  });
});

describe("getXsrf", () => {
  it("extracts the token from the &amp;-escaped data-dsp attribute", async () => {
    stubFetch("https://scholar.google.com/scholar_labs/search", LABS_PAGE);
    expect(await getXsrf({ SID: "x" })).toBe(
      "AKLELW8AAAAAanjJR0UDmqv3uVQ2CgbPfm005n4",
    );
  });

  it("still extracts the token when the page carries a ServiceLogin link", async () => {
    stubFetch(
      "https://scholar.google.com/scholar_labs/search",
      LABS_PAGE_WITH_LOGIN_LINK,
    );
    expect(await getXsrf({ SID: "x" })).toBe(
      "AKLELW8AAAAAanjJR0UDmqv3uVQ2CgbPfm005n4",
    );
  });

  it("blames the session (not the parser) on a sign-in redirect", async () => {
    stubFetch(
      "https://accounts.google.com/v3/signin/identifier?continue=x",
      "<html>sign in</html>",
    );
    const err = await getXsrf({ SID: "stale" }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).exitCode).toBe(EXIT.NOPERM);
    const msg = (err as Error).message;
    expect(msg).toContain("Not signed in to Google Scholar");
    expect(msg).toContain("scholar auth --port");
    expect(msg).not.toContain("Could not extract XSRF token");
  });

  it("names re-auth first and a layout change second when the token is missing", async () => {
    stubFetch(
      "https://scholar.google.com/scholar_labs/search",
      "<html>no token here</html>",
    );
    const err = await getXsrf({ SID: "x" }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(MissingTokenError);
    expect(err).not.toBeInstanceOf(AuthError);
    const msg = (err as Error).message;
    expect(msg).toContain("scholar auth --port");
    expect(msg).toContain("layout has changed");
    expect(msg.indexOf("scholar auth")).toBeLessThan(
      msg.indexOf("layout has changed"),
    );
  });

  it("reports a CAPTCHA wall as TEMPFAIL", async () => {
    stubFetch(
      "https://scholar.google.com/scholar_labs/search",
      "<div id=gs_captcha></div>",
    );
    const err = await getXsrf({ SID: "x" }).catch((e: Error) => e);
    expect((err as AuthError).exitCode).toBe(EXIT.TEMPFAIL);
    expect((err as Error).message).toContain("CAPTCHA");
  });
});
