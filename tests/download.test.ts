import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, unlinkSync } from "node:fs";

// ============================================================
// Unit tests for sanitizeFilename
// ============================================================
describe("sanitizeFilename", () => {
  it("converts a normal title to a valid filename", async () => {
    const { sanitizeFilename } = await import("../src/util/filename.js");
    expect(sanitizeFilename("Attention Is All You Need")).toBe(
      "Attention_Is_All_You_Need",
    );
  });

  it("removes special characters", async () => {
    const { sanitizeFilename } = await import("../src/util/filename.js");
    expect(sanitizeFilename("A Survey: Methods & Results (2024)")).toBe(
      "A_Survey_Methods_Results_2024",
    );
  });

  it("collapses multiple spaces into single underscore", async () => {
    const { sanitizeFilename } = await import("../src/util/filename.js");
    expect(sanitizeFilename("Too   Many   Spaces")).toBe("Too_Many_Spaces");
  });

  it("returns 'paper' for empty string", async () => {
    const { sanitizeFilename } = await import("../src/util/filename.js");
    expect(sanitizeFilename("")).toBe("paper");
  });

  it("returns 'paper' for string with only special characters", async () => {
    const { sanitizeFilename } = await import("../src/util/filename.js");
    expect(sanitizeFilename("!@#$%^&*()")).toBe("paper");
  });

  it("truncates long titles to 200 characters", async () => {
    const { sanitizeFilename } = await import("../src/util/filename.js");
    const longTitle = "A".repeat(300);
    const result = sanitizeFilename(longTitle);
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it("trims leading and trailing underscores", async () => {
    const { sanitizeFilename } = await import("../src/util/filename.js");
    expect(sanitizeFilename(" Leading and Trailing ")).toBe(
      "Leading_and_Trailing",
    );
  });

  it("preserves hyphens and dots", async () => {
    const { sanitizeFilename } = await import("../src/util/filename.js");
    expect(sanitizeFilename("Pre-trained Model v2.0")).toBe(
      "Pre-trained_Model_v2.0",
    );
  });
});

// ============================================================
// CLI tests for the download command
// ============================================================
describe("CLI download", () => {
  it("scholar download --help exits 0 with usage text", async () => {
    const proc = Bun.spawn(["bun", "run", "src/main.ts", "download", "--help"], {
      cwd: "/Users/vwh7mb/projects/google-scholar-cli",
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stdout).toContain("download");
  });

  it("scholar download without args exits 1 with error", async () => {
    const proc = Bun.spawn(["bun", "run", "src/main.ts", "download"], {
      cwd: "/Users/vwh7mb/projects/google-scholar-cli",
      stdout: "pipe",
      stderr: "pipe",
    });

    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(1);
    expect(stderr).toContain("No URL provided");
  });
});

// ============================================================
// CLI flag tests for --download on search and lookup
// ============================================================
describe("CLI --download flag", () => {
  it("scholar search --help mentions --download", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/main.ts", "search", "--help"],
      {
        cwd: "/Users/vwh7mb/projects/google-scholar-cli",
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stdout).toContain("--download");
  });

  it("scholar lookup --help mentions --download", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/main.ts", "lookup", "--help"],
      {
        cwd: "/Users/vwh7mb/projects/google-scholar-cli",
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stdout).toContain("--download");
  });

  it("scholar --help mentions download command", async () => {
    const proc = Bun.spawn(["bun", "run", "src/main.ts", "--help"], {
      cwd: "/Users/vwh7mb/projects/google-scholar-cli",
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stdout).toContain("download");
  });
});

// ============================================================
// Unit tests for downloadPdf content-type validation
// ============================================================
describe("downloadPdf content-type check", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws when server returns text/html (paywall/login page)", async () => {
    const { downloadPdf } = await import("../src/api/scholar.js");

    // Mock fetch to return HTTP 200 with text/html content type
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response("<html><body>Please log in</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
      ),
    ) as typeof fetch;

    const outPath = join(tmpdir(), `test-download-${Date.now()}.pdf`);
    try {
      await expect(
        downloadPdf("https://example.com/paper.pdf", outPath, {}),
      ).rejects.toThrow(
        "Server returned HTML instead of PDF (likely a paywall or login page)",
      );
      // File should NOT have been written
      expect(existsSync(outPath)).toBe(false);
    } finally {
      // Clean up just in case
      if (existsSync(outPath)) unlinkSync(outPath);
    }
  });

  it("succeeds when server returns application/pdf", async () => {
    const { downloadPdf } = await import("../src/api/scholar.js");

    const fakePdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(fakePdfBytes, {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        }),
      ),
    ) as typeof fetch;

    const outPath = join(tmpdir(), `test-download-${Date.now()}.pdf`);
    try {
      await downloadPdf("https://example.com/paper.pdf", outPath, {});
      expect(existsSync(outPath)).toBe(true);
    } finally {
      if (existsSync(outPath)) unlinkSync(outPath);
    }
  });

  it("succeeds when server returns application/octet-stream", async () => {
    const { downloadPdf } = await import("../src/api/scholar.js");

    const fakePdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(fakePdfBytes, {
          status: 200,
          headers: { "Content-Type": "application/octet-stream" },
        }),
      ),
    ) as typeof fetch;

    const outPath = join(tmpdir(), `test-download-${Date.now()}.pdf`);
    try {
      await downloadPdf("https://example.com/paper.pdf", outPath, {});
      expect(existsSync(outPath)).toBe(true);
    } finally {
      if (existsSync(outPath)) unlinkSync(outPath);
    }
  });
});
