import { describe, it, expect } from "bun:test";

const REPO_ROOT = new URL("..", import.meta.url).pathname;

describe("CLI", () => {
  it("scholar --help exits 0 with usage text", async () => {
    const proc = Bun.spawn([process.execPath, "run", "src/main.ts", "--help"], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stdout).toContain("scholar");
    expect(stdout).toContain("search");
    expect(stdout).toContain("auth");
  });

  it("scholar help exits 0", async () => {
    const proc = Bun.spawn([process.execPath, "run", "src/main.ts", "help"], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
  });

  it("scholar unknown-cmd exits 1 with error", async () => {
    const proc = Bun.spawn([process.execPath, "run", "src/main.ts", "unknown-cmd"], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unknown command");
  });

  it("scholar search without query exits 1 with error", async () => {
    const proc = Bun.spawn([process.execPath, "run", "src/main.ts", "search"], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(1);
    expect(stderr).toContain("No query provided");
  });
});
