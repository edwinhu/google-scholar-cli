import { saveCookies } from "../auth.js";
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

    const cookies = await new Promise<Record<string, string>>(
      (resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("CDP timeout after 10s"));
        }, 10_000);

        ws.onopen = () => {
          // Request cookies for google.com
          ws.send(
            JSON.stringify({
              id: 1,
              method: "Network.getCookies",
              params: {
                urls: [
                  "https://scholar.google.com",
                  "https://google.com",
                  "https://accounts.google.com",
                ],
              },
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

            // Filter for relevant Google auth cookies
            const googleCookies: Record<string, string> = {};
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

            for (const cookie of data.result.cookies as CdpCookie[]) {
              if (
                cookie.domain.includes("google.com") &&
                (relevantNames.has(cookie.name) ||
                  cookie.name.startsWith("__Secure-"))
              ) {
                googleCookies[cookie.name] = cookie.value;
              }
            }

            if (Object.keys(googleCookies).length === 0) {
              reject(
                new Error(
                  "No Google session cookies found. Are you signed into Google in Chrome?",
                ),
              );
              return;
            }

            resolve(googleCookies);
          }
        };

        ws.onerror = (err) => {
          clearTimeout(timeout);
          reject(new Error(`WebSocket error: ${err}`));
        };
      },
    );

    // 4. Save cookies
    saveCookies(cookies);

    console.log(`Saved ${Object.keys(cookies).length} Google cookies.`);
    console.log("Cookie names: " + Object.keys(cookies).join(", "));
    return 0;
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
