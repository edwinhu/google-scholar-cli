import { writeFileSync } from "node:fs";
import { saveCookies, saveAllCookies } from "../auth.js";
import type { BrowserCookie } from "../auth.js";
import { CONFIG_DIR, USER_AGENT } from "../config.js";
import { printError } from "../output.js";

interface CdpCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
}

/**
 * Auth command: extract Google session cookies from a running Chrome instance.
 * Chrome must be launched with --remote-debugging-port=<port>
 */
export async function cmdAuth(
  _args: string[],
  flags: { port?: number },
): Promise<number> {
  const port = flags.port || 9222;

  try {
    // 1. Discover available pages via CDP
    const listResp = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (!listResp.ok) {
      printError(
        `Cannot connect to Chrome CDP on port ${port}. Is Chrome running with --remote-debugging-port=${port}?`,
      );
      return 1;
    }

    const pages = (await listResp.json()) as Array<{
      webSocketDebuggerUrl: string;
      url: string;
    }>;

    // 2. Find a Google page or use first available
    const googlePage =
      pages.find((p) => p.url.includes("google.com")) || pages[0];
    if (!googlePage?.webSocketDebuggerUrl) {
      printError(
        "No suitable Chrome page found. Navigate to any Google page first.",
      );
      return 1;
    }

    // 3. Connect via WebSocket
    const ws = new WebSocket(googlePage.webSocketDebuggerUrl);

    const { googleCookies, allBrowserCookies } = await new Promise<{
      googleCookies: Record<string, string>;
      allBrowserCookies: BrowserCookie[];
    }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("CDP timeout after 10s"));
      }, 10_000);

      ws.onopen = () => {
        // Request ALL cookies from all domains
        ws.send(
          JSON.stringify({
            id: 1,
            method: "Network.getAllCookies",
          }),
        );
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(String(event.data));
        if (data.id === 1) {
          clearTimeout(timeout);
          ws.close();

          if (data.error) {
            reject(new Error(`CDP error: ${data.error.message}`));
            return;
          }

          const cdpCookies = data.result.cookies as CdpCookie[];

          // Filter to scholarly-relevant domains only
          const scholarlyDomains = [
            // Google
            "google.com", "google.dev", "googleapis.com",
            // Scholar tools
            "scholar.google.com", "paperpile.com", "zotero.org",
            "mendeley.com", "semanticscholar.org",
            // LibKey / Third Iron
            "libkey.io", "thirdiron.com",
            // Auth providers
            "openathens.net", "shibboleth",
            // Publishers
            "elsevier.com", "sciencedirect.com", "springer.com",
            "springerlink.com", "wiley.com", "tandfonline.com",
            "jstor.org", "sagepub.com", "ieee.org", "acm.org",
            "oup.com", "cambridge.org", "nature.com", "science.org",
            "pnas.org", "nih.gov", "ncbi.nlm.nih.gov", "pubmed",
            "doi.org", "crossref.org", "arxiv.org", "biorxiv.org",
            "medrxiv.org", "ssrn.com", "researchgate.net",
            "academia.edu", "heinonline.org",
            // Proxies / institutional
            "ebsco", "proquest", "westlaw", "thomsonreuters",
          ];

          const isScholarlyDomain = (domain: string): boolean => {
            const d = domain.replace(/^\./, "").toLowerCase();
            // .edu domains are always scholarly
            if (d.endsWith(".edu")) return true;
            // Check against known scholarly domains
            return scholarlyDomains.some(
              (sd) => d === sd || d.endsWith("." + sd),
            );
          };

          const browserCookies: BrowserCookie[] = cdpCookies
            .filter((c) => isScholarlyDomain(c.domain))
            .map((c) => ({
              name: c.name,
              value: c.value,
              domain: c.domain,
              path: c.path,
              secure: c.secure,
            }));

          // Filter for relevant Google auth cookies (backward compat)
          const filteredGoogleCookies: Record<string, string> = {};
          const relevantNames = new Set([
            "SID",
            "SSID",
            "HSID",
            "SAPISID",
            "APISID",
            "SIDCC",
            "__Secure-1PSID",
            "__Secure-3PSID",
            "__Secure-1PAPISID",
            "__Secure-3PAPISID",
            "NID",
            "1P_JAR",
          ]);

          for (const cookie of cdpCookies) {
            if (
              cookie.domain.includes("google.com") &&
              (relevantNames.has(cookie.name) ||
                cookie.name.startsWith("__Secure-"))
            ) {
              filteredGoogleCookies[cookie.name] = cookie.value;
            }
          }

          if (Object.keys(filteredGoogleCookies).length === 0) {
            reject(
              new Error(
                "No Google session cookies found. Are you signed into Google in Chrome?",
              ),
            );
            return;
          }

          resolve({
            googleCookies: filteredGoogleCookies,
            allBrowserCookies: browserCookies,
          });
        }
      };

      ws.onerror = (err) => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket error: ${err}`));
      };
    });

    // 4. Save cookies: Google-only (backward compat) + all browser cookies
    saveCookies(googleCookies);
    saveAllCookies(allBrowserCookies);

    console.log(`Saved ${Object.keys(googleCookies).length} Google cookies.`);
    console.log(
      "Cookie names: " + Object.keys(googleCookies).join(", "),
    );
    console.log(
      `Saved ${allBrowserCookies.length} scholarly domain cookies (publishers, proxies, .edu).`,
    );

    // 5. Extract and save institutional library ID
    const instId = await extractInstId(googleCookies, allBrowserCookies);
    if (instId) {
      writeFileSync(`${CONFIG_DIR}/inst`, instId, { mode: 0o600 });
      console.log(`Saved institutional ID: ${instId}`);
    }

    return 0;
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    return 1;
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
