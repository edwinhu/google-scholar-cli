// GOLDEN FILE — the auth failure taxonomy below is shared VERBATIM with
// ~/projects/consensus-cli/src/cdp.ts by convention. It is deliberately not a
// shared package: no new artifact, no release coordination. If you change one
// of these strings or codes, change BOTH repos. consensus-cli carries the
// mirror of this file.
import { describe, it, expect } from "bun:test";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  EXIT,
  browserUnreachable,
  notSignedIn,
  blocked,
} from "../src/cdp.js";

// The shared prefix of notSignedIn. Each tool may append its own re-auth hint.
const SHARED_NOT_SIGNED_IN =
  "Not signed in to example.com in the Chrome on CDP port 9250. Sign in there, then retry.";
const SCHOLAR_SUFFIX =
  " If you are signed in, refresh the local session with 'scholar auth --port 9250'.";

describe("shared convention (golden)", () => {
  it("EXIT is exactly the agreed sysexits set", () => {
    expect(EXIT).toEqual({ OK: 0, UNAVAILABLE: 69, NOPERM: 77, TEMPFAIL: 75 });
  });

  it("browserUnreachable renders verbatim", () => {
    const err = browserUnreachable(9250);
    expect(err.message).toBe(
      "Chrome not reachable on CDP port 9250. Start Chrome with --remote-debugging-port=9250 (automation profile: ~/.config/chrome-cdp), then retry.",
    );
    expect(err.exitCode).toBe(69);
  });

  it("notSignedIn renders the shared prefix verbatim", () => {
    const err = notSignedIn("example.com", 9250);
    expect(err.message.startsWith(SHARED_NOT_SIGNED_IN)).toBe(true);
    expect(err.exitCode).toBe(77);
  });

  it("notSignedIn appends the scholar-specific re-auth hint", () => {
    // Scholar-specific by design: consensus has no local session snapshot.
    expect(notSignedIn("example.com", 9250).message).toBe(
      SHARED_NOT_SIGNED_IN + SCHOLAR_SUFFIX,
    );
  });

  it("blocked renders verbatim", () => {
    const err = blocked("example.com", 9250);
    expect(err.message).toBe(
      "example.com returned a CAPTCHA or rate limit. Solve it in Chrome on CDP port 9250, then retry.",
    );
    expect(err.exitCode).toBe(75);
  });
});

// Cross-repo parity. Skipped (not failed) when the sibling checkout is absent,
// so CI without it stays green.
const SIBLING = join(homedir(), "projects", "consensus-cli", "src", "cdp.ts");
const parity = existsSync(SIBLING) ? describe : describe.skip;

parity("cross-repo parity with consensus-cli", () => {
  it("agrees on EXIT and all three rendered messages", async () => {
    const other = (await import(SIBLING)) as {
      EXIT?: Record<string, number>;
      browserUnreachable?: (p: number) => { message: string; exitCode: number };
      notSignedIn?: (s: string, p: number) => { message: string; exitCode: number };
      blocked?: (s: string, p: number) => { message: string; exitCode: number };
    };

    // A sibling that predates the convention has none of these exports yet.
    // Report that plainly instead of asserting against undefined.
    const missing = (
      ["EXIT", "browserUnreachable", "notSignedIn", "blocked"] as const
    ).filter((k) => other[k] === undefined);
    if (missing.length > 0) {
      throw new Error(
        `consensus-cli/src/cdp.ts is missing ${missing.join(", ")} — the shared convention has drifted (or has not landed there yet).`,
      );
    }

    expect(other.EXIT).toEqual(EXIT);
    expect(other.browserUnreachable!(9250).message).toBe(
      browserUnreachable(9250).message,
    );
    expect(other.browserUnreachable!(9250).exitCode).toBe(EXIT.UNAVAILABLE);

    // Shared prefix only — each tool appends its own hint.
    expect(
      other.notSignedIn!("example.com", 9250).message.startsWith(
        SHARED_NOT_SIGNED_IN,
      ),
    ).toBe(true);
    expect(other.notSignedIn!("example.com", 9250).exitCode).toBe(EXIT.NOPERM);

    expect(other.blocked!("example.com", 9250).message).toBe(
      blocked("example.com", 9250).message,
    );
    expect(other.blocked!("example.com", 9250).exitCode).toBe(EXIT.TEMPFAIL);
  });
});
