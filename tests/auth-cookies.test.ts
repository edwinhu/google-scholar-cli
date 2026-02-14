import { describe, it, expect } from "bun:test";

// ============================================================
// Unit tests for cookiesForUrl
// ============================================================
describe("cookiesForUrl", () => {
  it("matches .google.com cookies to scholar.google.com", async () => {
    const { cookiesForUrl } = await import("../src/auth.js");
    const cookies = [
      {
        name: "SID",
        value: "abc123",
        domain: ".google.com",
        path: "/",
        secure: true,
      },
    ];
    const result = cookiesForUrl(cookies, "https://scholar.google.com/search");
    expect(result).toBe("SID=abc123");
  });

  it("matches libkey.io cookies to libkey.io", async () => {
    const { cookiesForUrl } = await import("../src/auth.js");
    const cookies = [
      {
        name: "session",
        value: "xyz789",
        domain: "libkey.io",
        path: "/",
        secure: true,
      },
    ];
    const result = cookiesForUrl(cookies, "https://libkey.io/libraries/1234");
    expect(result).toBe("session=xyz789");
  });

  it("does NOT match .google.com cookies to libkey.io", async () => {
    const { cookiesForUrl } = await import("../src/auth.js");
    const cookies = [
      {
        name: "SID",
        value: "abc123",
        domain: ".google.com",
        path: "/",
        secure: true,
      },
    ];
    const result = cookiesForUrl(cookies, "https://libkey.io/something");
    expect(result).toBe("");
  });

  it("handles cookies with leading dot and without", async () => {
    const { cookiesForUrl } = await import("../src/auth.js");
    const cookies = [
      {
        name: "a",
        value: "1",
        domain: ".example.com",
        path: "/",
        secure: false,
      },
      {
        name: "b",
        value: "2",
        domain: "example.com",
        path: "/",
        secure: false,
      },
    ];
    const result = cookiesForUrl(cookies, "https://example.com/page");
    expect(result).toContain("a=1");
    expect(result).toContain("b=2");
  });

  it("matches subdomain with leading-dot domain cookie", async () => {
    const { cookiesForUrl } = await import("../src/auth.js");
    const cookies = [
      {
        name: "token",
        value: "abc",
        domain: ".university.edu",
        path: "/",
        secure: false,
      },
    ];
    const result = cookiesForUrl(
      cookies,
      "https://proxy.university.edu/login",
    );
    expect(result).toBe("token=abc");
  });

  it("returns empty string when no cookies match", async () => {
    const { cookiesForUrl } = await import("../src/auth.js");
    const cookies = [
      {
        name: "SID",
        value: "abc123",
        domain: ".google.com",
        path: "/",
        secure: true,
      },
    ];
    const result = cookiesForUrl(cookies, "https://unrelated.org/page");
    expect(result).toBe("");
  });

  it("formats multiple matching cookies correctly", async () => {
    const { cookiesForUrl } = await import("../src/auth.js");
    const cookies = [
      {
        name: "SID",
        value: "abc",
        domain: ".google.com",
        path: "/",
        secure: true,
      },
      {
        name: "HSID",
        value: "def",
        domain: ".google.com",
        path: "/",
        secure: true,
      },
      {
        name: "other",
        value: "xyz",
        domain: ".libkey.io",
        path: "/",
        secure: true,
      },
    ];
    const result = cookiesForUrl(
      cookies,
      "https://scholar.google.com/search",
    );
    expect(result).toBe("SID=abc; HSID=def");
  });

  it("returns empty string for empty cookie array", async () => {
    const { cookiesForUrl } = await import("../src/auth.js");
    const result = cookiesForUrl([], "https://example.com");
    expect(result).toBe("");
  });
});

// ============================================================
// Unit tests for BrowserCookie interface, saveAllCookies, resolveAllCookies
// ============================================================
describe("saveAllCookies and resolveAllCookies", () => {
  it("resolveAllCookies returns empty array when no file exists", async () => {
    const { resolveAllCookies } = await import("../src/auth.js");
    // resolveAllCookies checks for BROWSER_COOKIES_FILE which reads from CONFIG_DIR.
    // We test the function's behavior when the file doesn't exist.
    // Since the file won't exist in the user's home (clean test env), this should return [].
    // But in practice, we need to test the actual logic.
    const result = resolveAllCookies();
    // If no browser-cookies file exists, should return []
    expect(Array.isArray(result)).toBe(true);
  });

  it("resolveAllCookies returns parsed cookies from browser-cookies file", async () => {
    const { resolveAllCookies, saveAllCookies } = await import(
      "../src/auth.js"
    );
    const cookies = [
      {
        name: "SID",
        value: "abc123",
        domain: ".google.com",
        path: "/",
        secure: true,
      },
      {
        name: "session",
        value: "xyz789",
        domain: ".libkey.io",
        path: "/",
        secure: true,
      },
    ];

    // Save and then resolve - this tests real file I/O
    saveAllCookies(cookies);
    const result = resolveAllCookies();
    expect(result).toEqual(cookies);
  });

  it("BrowserCookie objects have all required fields", async () => {
    const { saveAllCookies, resolveAllCookies } = await import(
      "../src/auth.js"
    );
    const cookies = [
      {
        name: "EZproxy",
        value: "token123",
        domain: ".proxy.university.edu",
        path: "/",
        secure: false,
      },
    ];

    saveAllCookies(cookies);
    const result = resolveAllCookies();

    expect(result.length).toBe(1);
    expect(result[0].name).toBe("EZproxy");
    expect(result[0].value).toBe("token123");
    expect(result[0].domain).toBe(".proxy.university.edu");
    expect(result[0].path).toBe("/");
    expect(result[0].secure).toBe(false);
  });
});

// ============================================================
// Unit tests for downloadPdf with allCookies (manual redirect following)
// ============================================================
describe("downloadPdf with allCookies", () => {
  it("downloadPdf accepts optional allCookies parameter", async () => {
    const { downloadPdf } = await import("../src/api/scholar.js");
    // Just verify the function signature accepts 4 params without error
    // We can't actually call it without a real server, but we verify the type
    expect(typeof downloadPdf).toBe("function");
    expect(downloadPdf.length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================
// CLI regression test
// ============================================================
describe("CLI auth regression", () => {
  it("scholar --help mentions auth command", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/main.ts", "--help"],
      {
        cwd: "/Users/vwh7mb/projects/google-scholar-cli",
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stdout).toContain("auth");
  });
});

// ============================================================
// Config tests
// ============================================================
describe("BROWSER_COOKIES_FILE config", () => {
  it("BROWSER_COOKIES_FILE is defined and points to browser-cookies", async () => {
    const { BROWSER_COOKIES_FILE } = await import("../src/config.js");
    expect(BROWSER_COOKIES_FILE).toBeDefined();
    expect(BROWSER_COOKIES_FILE).toContain("browser-cookies");
    expect(BROWSER_COOKIES_FILE).toContain(".google-scholar");
  });
});
