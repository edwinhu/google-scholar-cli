import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";

describe("test config isolation", () => {
  it("the suite never points CONFIG_DIR at the real ~/.google-scholar", async () => {
    const { CONFIG_DIR, BROWSER_COOKIES_FILE } = await import("../src/config.js");
    expect(CONFIG_DIR).not.toBe(join(homedir(), ".google-scholar"));
    expect(BROWSER_COOKIES_FILE.startsWith(CONFIG_DIR)).toBe(true);
  });
});
