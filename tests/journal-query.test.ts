// Pins the journal-filter mechanism.
//
// Scholar publishes no venue parameter. `as_publication=` (the name its own
// advanced-search form uses) is accepted on GET /scholar and then silently
// ignored; the undocumented `source:"..."` operator, inside q, is what actually
// filters. Undocumented means it can vanish without warning, and it would
// vanish QUIETLY — the query still returns results, just unfiltered ones.
//
// The unit tests below pin how we build the query. The live tests pin what
// Scholar does with it, and run only with SCHOLAR_LIVE=1 (they need auth
// cookies and hit the network):
//
//     SCHOLAR_LIVE=1 bun test tests/journal-query.test.ts
import { describe, it, expect } from "bun:test";
import { buildJournalQuery, MAX_QUERY_LENGTH } from "../src/util/query.js";

describe("buildJournalQuery", () => {
  it("appends a single source: term", () => {
    expect(buildJournalQuery("shareholder voting", ["Harvard Business Law Review"]))
      .toBe('shareholder voting source:"Harvard Business Law Review"');
  });

  it("joins multiple journals with OR", () => {
    expect(
      buildJournalQuery("shareholder voting", [
        "Harvard Business Law Review",
        "Columbia Business Law Review",
      ]),
    ).toBe(
      'shareholder voting source:"Harvard Business Law Review" OR source:"Columbia Business Law Review"',
    );
  });

  it("returns the query untouched when no journals are given", () => {
    expect(buildJournalQuery("insider trading", [])).toBe("insider trading");
  });

  it("keeps an ampersand in a journal name verbatim", () => {
    // "Virginia Law & Business Review" round-trips; & has no meaning inside a
    // quoted source: term, and encodeURIComponent handles the transport.
    expect(buildJournalQuery("q", ["Virginia Law & Business Review"]))
      .toBe('q source:"Virginia Law & Business Review"');
  });

  it("drops blank names and trims", () => {
    expect(buildJournalQuery("q", ["  Nature  ", "", "   "]))
      .toBe('q source:"Nature"');
  });

  it("strips embedded double quotes, which would end the term early", () => {
    expect(buildJournalQuery("q", ['Journal of "Weird" Studies']))
      .toBe('q source:"Journal of Weird Studies"');
  });

  it("emits a bare source: clause when the query is empty", () => {
    expect(buildJournalQuery("", ["Nature"])).toBe('source:"Nature"');
  });
});

// ---------------------------------------------------------------------------
// Live pins — network + auth. Opt in with SCHOLAR_LIVE=1.
// ---------------------------------------------------------------------------

const live = process.env.SCHOLAR_LIVE === "1";
const liveIt = live ? it : it.skip;

async function scholarJournals(query: string, extraParams = ""): Promise<string[]> {
  const { existsSync, readFileSync } = await import("node:fs");
  const { INST_FILE, API_BASE } = await import("../src/config.js");
  const { resolveCookies, resolveAllCookies, cookiesForUrl } = await import("../src/auth.js");
  const { navHeaders } = await import("../src/identity.js");

  const cookies = resolveCookies();
  const all = resolveAllCookies();
  const header =
    (all.length > 0 ? cookiesForUrl(all, API_BASE) : "") ||
    Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  const inst = existsSync(INST_FILE) ? readFileSync(INST_FILE, "utf-8").trim() : "";

  const url =
    `${API_BASE}/scholar?q=${encodeURIComponent(query)}&hl=en${extraParams}` +
    (inst ? `&inst=${inst}` : "");
  const resp = await fetch(url, {
    headers: { Cookie: header, Referer: `${API_BASE}/`, ...navHeaders() },
  });
  expect(resp.status).toBe(200);
  const html = await resp.text();
  // The gs_a byline is "Authors - Journal, Year - Host".
  return [...html.matchAll(/<div class="gs_a">(.*?)<\/div>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim(),
  );
}

describe("Scholar journal filtering (live)", () => {
  liveIt(
    "source: actually restricts results to the named journal",
    async () => {
      const bylines = await scholarJournals(
        buildJournalQuery("passive funds voting", ["Journal of Corporation Law"]),
      );
      expect(bylines.length).toBeGreaterThan(0);
      // Every byline must name the journal. If Google drops the operator this
      // fails loudly instead of quietly returning the whole corpus.
      for (const b of bylines) {
        expect(b.toLowerCase()).toContain("journal of corporation law");
      }
    },
    30_000,
  );

  liveIt(
    "as_publication= is still ignored, which is why source: is used",
    async () => {
      const bylines = await scholarJournals(
        "mirror voting passive index funds",
        '&as_publication=%22Harvard+Business+Law+Review%22',
      );
      expect(bylines.length).toBeGreaterThan(0);
      // If this ever starts filtering, prefer the real parameter over the
      // undocumented operator and delete buildJournalQuery.
      const allHBLR = bylines.every((b) =>
        b.toLowerCase().includes("harvard business law review"),
      );
      expect(allHBLR).toBe(false);
    },
    30_000,
  );
});
