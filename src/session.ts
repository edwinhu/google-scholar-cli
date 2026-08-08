import {
  resolveCookies,
  saveCookies,
  saveAllCookies,
  type Cookies,
} from "./auth.js";
import {
  AuthError,
  EXIT,
  cdpPort,
  cdpReachable,
  extractCookies,
} from "./cdp.js";
import { getXsrf, MissingTokenError } from "./api/scholar.js";
import { saveIdentity } from "./identity.js";

export interface Session {
  cookies: Cookies;
  xsrf: string;
}

/**
 * Whether a failure is worth re-extracting cookies for.
 *
 * Only the two auth-shaped symptoms qualify: a sign-in redirect (NOPERM), and
 * a page that loaded without a token (a partly-valid session looks like this).
 * A CAPTCHA/rate-limit needs a human, and a 5xx is Scholar's problem — both
 * would only burn a second request.
 */
function isSelfHealable(err: unknown): boolean {
  if (err instanceof MissingTokenError) return true;
  return err instanceof AuthError && err.exitCode === EXIT.NOPERM;
}

/**
 * Open a Labs session: load the cookie snapshot and fetch an XSRF token.
 *
 * If the snapshot has gone stale and Chrome is reachable, re-extract cookies
 * and retry EXACTLY once (guarded by `retried`, never a loop), reporting the
 * refresh on stderr. If the retry also fails, the original error propagates.
 */
export async function openSession(retried = false): Promise<Session> {
  const cookies = resolveCookies();

  try {
    return { cookies, xsrf: await getXsrf(cookies) };
  } catch (err) {
    if (retried || !isSelfHealable(err)) throw err;

    // An explicit GOOGLE_SCHOLAR_COOKIES override is the user's choice. It wins
    // over the snapshot in resolveCookies(), so refreshing the snapshot would
    // change nothing and the retry would be a guaranteed no-op.
    if (process.env.GOOGLE_SCHOLAR_COOKIES) throw err;

    const port = cdpPort();
    if (!(await cdpReachable(port))) throw err;

    let refreshed;
    try {
      refreshed = await extractCookies(port);
    } catch {
      throw err; // report the original failure, not the refresh's
    }

    saveCookies(refreshed.googleCookies);
    saveAllCookies(refreshed.allBrowserCookies);
    // A stale UA is as much a bot signature as a stale cookie — refresh both.
    saveIdentity(refreshed.identity);
    process.stderr.write(
      `session was stale; refreshed cookies from Chrome on :${port}\n`,
    );

    return openSession(true);
  }
}
