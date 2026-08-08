import { describe, it, expect } from "bun:test";
import { applyLimit } from "../src/util/limit.js";
import type { ScholarResult } from "../src/util/html.js";

const REPO_ROOT = new URL("..", import.meta.url).pathname;

function result(position: number): ScholarResult {
  return {
    position,
    title: `Paper ${position}`,
    authors: "A Author",
    year: "2024",
    citations: 0,
    journal: "",
    publisher: "",
    snippet: "",
    url: "",
    pdfUrl: null,
    clusterId: String(position),
    fullTextLinks: [],
  };
}

const TEN = Array.from({ length: 10 }, (_, i) => result(i));

describe("applyLimit", () => {
  it("returns everything when no limit is set", () => {
    expect(applyLimit(TEN)).toHaveLength(10);
  });

  it("keeps the first n results, in order", () => {
    const out = applyLimit(TEN, 2);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.position)).toEqual([0, 1]);
  });

  it("is a no-op when the limit exceeds the result count", () => {
    expect(applyLimit(TEN, 50)).toHaveLength(10);
  });

  it("does not mutate the input", () => {
    applyLimit(TEN, 1);
    expect(TEN).toHaveLength(10);
  });
});

describe("CLI --limit contract", () => {
  const run = (args: string[]) =>
    Bun.spawn([process.execPath, "run", "src/main.ts", ...args], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });

  it("rejects a non-numeric --limit before doing any work", async () => {
    const proc = run(["search", "q", "--limit", "abc"]);
    const stderr = await new Response(proc.stderr).text();
    expect(await proc.exited).toBe(1);
    expect(stderr).toContain("--limit requires a positive integer");
  });

  it("rejects --limit 0", async () => {
    const proc = run(["search", "q", "--limit", "0"]);
    expect(await proc.exited).toBe(1);
  });

  it("documents --limit in search help", async () => {
    const proc = run(["search", "--help"]);
    const stdout = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(stdout).toContain("--limit");
  });

  it("documents --limit in lookup help", async () => {
    const proc = run(["lookup", "--help"]);
    const stdout = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(stdout).toContain("--limit");
  });

  it("advertises the 9250 CDP default in global help", async () => {
    const proc = run(["--help"]);
    const stdout = await new Response(proc.stdout).text();
    expect(stdout).toContain("9250");
    expect(stdout).toContain("SCHOLAR_CDP_PORT");
  });
});

describe("CLI CDP port resolution", () => {
  it("exits UNAVAILABLE (69) naming the unreachable port", async () => {
    const proc = Bun.spawn([process.execPath, "run", "src/main.ts", "auth"], {
      cwd: REPO_ROOT,
      env: { ...process.env, SCHOLAR_CDP_PORT: "9999" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const stderr = await new Response(proc.stderr).text();
    expect(await proc.exited).toBe(69);
    expect(stderr).toContain("Chrome not reachable on CDP port 9999");
    expect(stderr).toContain("--remote-debugging-port=9999");
  });
});
