import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = join(homedir(), ".google-scholar");
export const COOKIES_FILE = join(CONFIG_DIR, "cookies");
export const API_BASE = "https://scholar.google.com";
export const SEARCH_PATH = "/scholar_labs/search";
