import { describe, it, expect } from "bun:test";
import {
  deriveIdentity,
  FALLBACK_IDENTITY,
  loadIdentity,
  browserHeaders,
  navHeaders,
} from "../src/identity.js";

const LINUX_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const WIN_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

describe("deriveIdentity", () => {
  it("derives platform and brands from a Linux UA when userAgentData is empty", () => {
    // Verified real behaviour: Chromium 150 reports platform "" and brands [].
    const id = deriveIdentity(LINUX_UA, { platform: "", brands: [] });
    expect(id.userAgent).toBe(LINUX_UA);
    expect(id.platform).toBe("Linux");
    expect(id.brands).toBe('"Chromium";v="150", "Not)A;Brand";v="24"');
  });

  it("derives from the UA when userAgentData is absent entirely", () => {
    expect(deriveIdentity(MAC_UA).platform).toBe("macOS");
    expect(deriveIdentity(MAC_UA).brands).toBe(
      '"Chromium";v="149", "Not)A;Brand";v="24"',
    );
    expect(deriveIdentity(WIN_UA).platform).toBe("Windows");
  });

  it("prefers real userAgentData when the browser populates it", () => {
    const id = deriveIdentity(LINUX_UA, {
      platform: "macOS",
      brands: [
        { brand: "Google Chrome", version: "150" },
        { brand: "Not)A;Brand", version: "24" },
      ],
    });
    expect(id.platform).toBe("macOS");
    expect(id.brands).toBe('"Google Chrome";v="150", "Not)A;Brand";v="24"');
  });

  it("keeps the UA's major version — never a hardcoded one", () => {
    for (const [ua, major] of [
      [LINUX_UA, "150"],
      [MAC_UA, "149"],
      [WIN_UA, "151"],
    ] as const) {
      expect(deriveIdentity(ua).brands).toContain(`v="${major}"`);
    }
  });

  it("falls back to the shipped brands for an unrecognisable UA", () => {
    const id = deriveIdentity("something/1.0");
    expect(id.platform).toBe("Unknown");
    expect(id.brands).toBe(FALLBACK_IDENTITY.brands);
  });
});

describe("headers derived from the stored identity", () => {
  it("agree with each other — UA platform matches sec-ch-ua-platform", () => {
    const id = loadIdentity();
    const headers = browserHeaders();
    expect(headers["User-Agent"]).toBe(id.userAgent);
    expect(headers["sec-ch-ua-platform"]).toBe(`"${id.platform}"`);
    expect(headers["sec-ch-ua"]).toBe(id.brands);

    // The invariant that used to be false: the platform claimed by the client
    // hint must be the one implied by the UA string itself.
    const impliedByUa = /Macintosh|Mac OS X/.test(id.userAgent)
      ? "macOS"
      : /Windows/.test(id.userAgent)
        ? "Windows"
        : /X11|Linux/.test(id.userAgent)
          ? "Linux"
          : "Unknown";
    expect(id.platform).toBe(impliedByUa);
  });

  it("agree on the Chrome major version between UA and sec-ch-ua", () => {
    const id = loadIdentity();
    const uaMajor = id.userAgent.match(/Chrome\/(\d+)/)?.[1];
    if (uaMajor) expect(id.brands).toContain(`v="${uaMajor}"`);
  });

  it("navHeaders extends browserHeaders with navigation headers", () => {
    const nav = navHeaders();
    const base = browserHeaders();
    for (const [k, v] of Object.entries(base)) expect(nav[k]).toBe(v);
    expect(nav["sec-fetch-mode"]).toBe("navigate");
    expect(nav["upgrade-insecure-requests"]).toBe("1");
  });
});
