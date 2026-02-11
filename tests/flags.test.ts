import { describe, it, expect } from "bun:test";
import { parseFlags } from "../src/main.js";

describe("parseFlags", () => {
  it("parses --json as boolean flag", () => {
    const result = parseFlags(["--json"]);
    expect(result.flags.json).toBe(true);
    expect(result.args).toEqual([]);
  });

  it("parses --port 9222 as string value flag", () => {
    const result = parseFlags(["--port", "9222"]);
    expect(result.flags.port).toBe("9222");
    expect(result.args).toEqual([]);
  });

  it("parses positional args correctly", () => {
    const result = parseFlags(["search", "my query"]);
    expect(result.args).toEqual(["search", "my query"]);
    expect(result.flags).toEqual({});
  });

  it("handles -- separator", () => {
    const result = parseFlags(["--json", "--", "--not-a-flag", "value"]);
    expect(result.flags.json).toBe(true);
    expect(result.args).toEqual(["--not-a-flag", "value"]);
  });

  it("handles mixed flags and args", () => {
    const result = parseFlags(["search", "my query", "--json"]);
    expect(result.args).toEqual(["search", "my query"]);
    expect(result.flags.json).toBe(true);
  });

  it("handles unknown flags gracefully", () => {
    const result = parseFlags(["--unknown-flag", "--another"]);
    expect(result.flags["unknown-flag"]).toBe(true);
    expect(result.flags.another).toBe(true);
    expect(result.args).toEqual([]);
  });

  it("parses empty argv", () => {
    const result = parseFlags([]);
    expect(result.args).toEqual([]);
    expect(result.flags).toEqual({});
  });

  it("handles --interactive as boolean flag", () => {
    const result = parseFlags(["search", "--interactive"]);
    expect(result.flags.interactive).toBe(true);
    expect(result.args).toEqual(["search"]);
  });

  it("handles --help as boolean flag", () => {
    const result = parseFlags(["--help"]);
    expect(result.flags.help).toBe(true);
    expect(result.args).toEqual([]);
  });

  it("handles flag with value followed by boolean flag", () => {
    const result = parseFlags(["--port", "9222", "--json"]);
    expect(result.flags.port).toBe("9222");
    expect(result.flags.json).toBe(true);
    expect(result.args).toEqual([]);
  });

  it("treats flag value starting with -- as boolean", () => {
    // --port followed by --json means port is boolean, json is boolean
    const result = parseFlags(["--port", "--json"]);
    expect(result.flags.port).toBe(true);
    expect(result.flags.json).toBe(true);
  });
});

describe("config exports", () => {
  it("exports CONFIG_DIR, COOKIES_FILE, API_BASE, SEARCH_PATH", async () => {
    const config = await import("../src/config.js");
    expect(config.CONFIG_DIR).toContain(".google-scholar");
    expect(config.COOKIES_FILE).toContain("cookies");
    expect(config.API_BASE).toBe("https://scholar.google.com");
    expect(config.SEARCH_PATH).toBe("/scholar_labs/search");
  });
});

describe("output exports", () => {
  it("exports printJson, printTable, printError", async () => {
    const output = await import("../src/output.js");
    expect(typeof output.printJson).toBe("function");
    expect(typeof output.printTable).toBe("function");
    expect(typeof output.printError).toBe("function");
  });
});
