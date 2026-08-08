import { saveCookies, saveAllCookies, writeFileAtomic } from "../auth.js";
import type { BrowserCookie } from "../auth.js";
import { INST_FILE, USER_AGENT } from "../config.js";
import { cdpPort, extractCookies, exitCodeFor } from "../cdp.js";
import { printError } from "../output.js";

/**
 * Auth command: extract Google session cookies from a running Chrome instance.
 * Chrome must be launched with --remote-debugging-port=<port>
 */
export async function cmdAuth(
  _args: string[],
  flags: { port?: number },
): Promise<number> {
  const port = cdpPort(flags.port);

  try {
    const { googleCookies, allBrowserCookies } = await extractCookies(port);

    saveCookies(googleCookies);
    saveAllCookies(allBrowserCookies);

    console.log(`Saved ${Object.keys(googleCookies).length} Google cookies.`);
    console.log("Cookie names: " + Object.keys(googleCookies).join(", "));
    console.log(
      `Saved ${allBrowserCookies.length} scholarly domain cookies (publishers, proxies, .edu).`,
    );

    // Extract and save institutional library ID
    const instId = await extractInstId(googleCookies, allBrowserCookies);
    if (instId) {
      writeFileAtomic(INST_FILE, instId);
      console.log(`Saved institutional ID: ${instId}`);
    }

    return 0;
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    return exitCodeFor(err);
  }
}

/**
 * Extract the institutional library ID (inst=<ID>) from Google Scholar.
 * Fetches the Scholar settings page and a test search using saved cookies,
 * looking for the inst= parameter that Scholar includes when library links
 * are configured.
 */
async function extractInstId(
  cookies: Record<string, string>,
  browserCookies: BrowserCookie[],
): Promise<string | null> {
  // Use domain-matched browser cookies (includes GSP with library config)
  const scholarCookies = browserCookies
    .filter((c) => {
      const d = c.domain.replace(/^\./, "").toLowerCase();
      return d === "scholar.google.com" || d === "google.com" || d.endsWith(".google.com");
    })
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  // Also include the Google auth cookies
  const googleStr = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  const cookieStr = scholarCookies ? `${scholarCookies}; ${googleStr}` : googleStr;
  const headers = {
    Cookie: cookieStr,
    "User-Agent": USER_AGENT,
  };

  try {
    // Fetch the settings page which contains hidden form inputs with inst values.
    // Checked libraries have: <input name="inst" value="ID" checked> followed by a <label>
    const settingsResp = await fetch(
      "https://scholar.google.com/scholar_settings?hl=en",
      { headers },
    );
    if (!settingsResp.ok) return null;

    const html = await settingsResp.text();

    // Extract checked library inst values (skip value="1" which is a boolean flag)
    const checkedLibs = [
      ...html.matchAll(
        /name="inst"[^>]*value="(\d{2,})"[^>]*checked/g,
      ),
    ].map((m) => m[1]);

    // Also check reverse order: checked before value
    const checkedLibsAlt = [
      ...html.matchAll(
        /value="(\d{10,})"[^>]*checked/g,
      ),
    ].map((m) => m[1]);

    const allIds = [...new Set([...checkedLibs, ...checkedLibsAlt])];
    return allIds.length > 0 ? allIds[0] : null;
  } catch {
    return null;
  }
}
