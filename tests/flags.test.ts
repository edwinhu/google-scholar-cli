import { describe, it, expect, afterEach } from "bun:test";
import { parseFlags, parseLimit } from "../src/main.js";
import { cdpPort, DEFAULT_CDP_PORT } from "../src/cdp.js";

describe("parseFlags", () => {
  it("parses --json as boolean flag", () => {
    const result = parseFlags(["--json"]);
    expect(result.flags.json).toBe(true);
    expect(result.args).toEqual([]);
  });

  it("parses --port 9250 as string value flag", () => {
    const result = parseFlags(["--port", "9250"]);
    expect(result.flags.port).toBe("9250");
    expect(result.args).toEqual([]);
  });

  it("parses --limit as a string value flag", () => {
    const result = parseFlags(["search", "q", "--limit", "2"]);
    expect(result.flags.limit).toBe("2");
    expect(result.args).toEqual(["search", "q"]);
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
    const result = parseFlags(["--port", "9250", "--json"]);
    expect(result.flags.port).toBe("9250");
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

describe("parseLimit", () => {
  it("returns undefined when the flag is absent", () => {
    expect(parseLimit(undefined)).toBeUndefined();
  });

  it("parses a positive integer", () => {
    expect(parseLimit("2")).toBe(2);
    expect(parseLimit("10")).toBe(10);
  });

  it("rejects a bare --limit with no value", () => {
    expect(parseLimit(true)).toBeNull();
  });

  it("rejects zero, negatives, fractions and garbage", () => {
    expect(parseLimit("0")).toBeNull();
    expect(parseLimit("-1")).toBeNull();
    expect(parseLimit("2.5")).toBeNull();
    expect(parseLimit("abc")).toBeNull();
    expect(parseLimit("")).toBeNull();
  });
});

describe("cdpPort", () => {
  const savedTool = process.env.SCHOLAR_CDP_PORT;
  const savedShared = process.env.CDP_PORT;
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  afterEach(() => {
    restore("SCHOLAR_CDP_PORT", savedTool);
    restore("CDP_PORT", savedShared);
  });

  it("defaults to 9250 (the dedicated automation profile)", () => {
    delete process.env.SCHOLAR_CDP_PORT;
    delete process.env.CDP_PORT;
    expect(DEFAULT_CDP_PORT).toBe(9250);
    expect(cdpPort()).toBe(9250);
  });

  it("uses SCHOLAR_CDP_PORT when no flag is given", () => {
    delete process.env.CDP_PORT;
    process.env.SCHOLAR_CDP_PORT = "9333";
    expect(cdpPort()).toBe(9333);
  });

  it("falls back to the shared CDP_PORT when SCHOLAR_CDP_PORT is unset", () => {
    delete process.env.SCHOLAR_CDP_PORT;
    process.env.CDP_PORT = "9260";
    expect(cdpPort()).toBe(9260);
  });

  it("lets SCHOLAR_CDP_PORT win over CDP_PORT", () => {
    process.env.SCHOLAR_CDP_PORT = "9333";
    process.env.CDP_PORT = "9260";
    expect(cdpPort()).toBe(9333);
  });

  it("honours the full chain: flag > SCHOLAR_CDP_PORT > CDP_PORT > default", () => {
    process.env.SCHOLAR_CDP_PORT = "9333";
    process.env.CDP_PORT = "9260";
    expect(cdpPort(9444)).toBe(9444);
    delete process.env.SCHOLAR_CDP_PORT;
    expect(cdpPort()).toBe(9260);
    delete process.env.CDP_PORT;
    expect(cdpPort()).toBe(DEFAULT_CDP_PORT);
  });

  it("falls past a garbage SCHOLAR_CDP_PORT to CDP_PORT", () => {
    process.env.SCHOLAR_CDP_PORT = "abc";
    process.env.CDP_PORT = "9260";
    expect(cdpPort()).toBe(9260);
  });

  it("gives the --port flag precedence over the env vars", () => {
    process.env.SCHOLAR_CDP_PORT = "9333";
    process.env.CDP_PORT = "9260";
    expect(cdpPort(9444)).toBe(9444);
  });

  it("falls back past a garbage or out-of-range env var", () => {
    delete process.env.CDP_PORT;
    for (const bad of ["abc", "", "0", "-5", "70000"]) {
      process.env.SCHOLAR_CDP_PORT = bad;
      expect(cdpPort()).toBe(DEFAULT_CDP_PORT);
    }
  });

  it("falls back past an invalid flag port (e.g. --port abc -> NaN)", () => {
    delete process.env.SCHOLAR_CDP_PORT;
    delete process.env.CDP_PORT;
    expect(cdpPort(NaN)).toBe(DEFAULT_CDP_PORT);
    expect(cdpPort(0)).toBe(DEFAULT_CDP_PORT);
    expect(cdpPort(70000)).toBe(DEFAULT_CDP_PORT);
  });
});
