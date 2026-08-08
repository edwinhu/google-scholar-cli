import { describe, it, expect } from "bun:test";
import {
  AuthError,
  EXIT,
  browserUnreachable,
  notSignedIn,
  blocked,
  exitCodeFor,
} from "../src/cdp.js";
import { MissingTokenError } from "../src/api/scholar.js";

describe("failure taxonomy", () => {
  it("uses sysexits codes", () => {
    expect(EXIT).toEqual({ OK: 0, UNAVAILABLE: 69, NOPERM: 77, TEMPFAIL: 75 });
  });

  it("browserUnreachable is UNAVAILABLE (69) and names the port twice", () => {
    const err = browserUnreachable(9250);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.exitCode).toBe(EXIT.UNAVAILABLE);
    expect(err.message).toBe(
      "Chrome not reachable on CDP port 9250. Start Chrome with --remote-debugging-port=9250 (automation profile: ~/.config/chrome-cdp), then retry.",
    );
  });

  it("notSignedIn is NOPERM (77) and points at scholar auth", () => {
    const err = notSignedIn("Google Scholar", 9250);
    expect(err.exitCode).toBe(EXIT.NOPERM);
    expect(err.message).toBe(
      "Not signed in to Google Scholar in the Chrome on CDP port 9250. Sign in there, then retry." +
        " If you are signed in, refresh the local session with 'scholar auth --port 9250'.",
    );
  });

  it("blocked is TEMPFAIL (75)", () => {
    const err = blocked("Google Scholar", 9250);
    expect(err.exitCode).toBe(EXIT.TEMPFAIL);
    expect(err.message).toBe(
      "Google Scholar returned a CAPTCHA or rate limit. Solve it in Chrome on CDP port 9250, then retry.",
    );
  });

  it("exitCodeFor maps AuthError to its code and everything else to 1", () => {
    expect(exitCodeFor(browserUnreachable(9250))).toBe(69);
    expect(exitCodeFor(notSignedIn("x", 1))).toBe(77);
    expect(exitCodeFor(blocked("x", 1))).toBe(75);
    expect(exitCodeFor(new Error("boom"))).toBe(1);
    expect(exitCodeFor("not even an error")).toBe(1);
  });

  it("keeps a layout change at exit 1 — never conflated with NOPERM", () => {
    const err = new MissingTokenError("layout changed");
    expect(err).not.toBeInstanceOf(AuthError);
    expect(exitCodeFor(err)).toBe(1);
    expect(exitCodeFor(err)).not.toBe(EXIT.NOPERM);
  });
});
