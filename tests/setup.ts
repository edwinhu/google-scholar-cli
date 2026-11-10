// Test preload (see bunfig.toml): give every test run its own config dir.
//
// src/config.ts resolves CONFIG_DIR at import time, and some tests write
// through it (saveAllCookies). Without this, `bun test` overwrote the real
// ~/.google-scholar/browser-cookies with fixtures, and every later lookup
// returned "No results found" until the user re-ran `scholar auth`.
//
// Live tests (SCHOLAR_LIVE=1) need real auth, so they get a COPY of the real
// config dir: they can read the user's cookies but writes still land in the
// temp copy.
import { afterAll } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

if (!process.env.SCHOLAR_CONFIG_DIR) {
  const root = mkdtempSync(join(tmpdir(), "scholar-test-"));
  const dir = join(root, ".google-scholar");
  const real = join(homedir(), ".google-scholar");

  if (process.env.SCHOLAR_LIVE === "1" && existsSync(real)) {
    cpSync(real, dir, { recursive: true });
  } else {
    mkdirSync(dir, { recursive: true });
  }

  process.env.SCHOLAR_CONFIG_DIR = dir;
  // A preload's afterAll runs once after the whole run (process "exit"
  // handlers don't fire under bun test).
  afterAll(() => rmSync(root, { recursive: true, force: true }));
}
