import { describe, expect, it } from "bun:test";
import { parseResultCard, parseResultCards } from "../src/util/html";
import type { FullTextLink } from "../src/util/html";

// ---------------------------------------------------------------------------
// Test fixtures -- real-looking Scholar HTML matching actual Labs API output
// ---------------------------------------------------------------------------

const FULL_CARD_HTML = `<div class="gs_r gs_or gs_scl"
     data-cid="BKeR2rt3wyMJ"
     data-did="BKeR2rt3wyMJ"
     data-lid=""
     data-aid="BKeR2rt3wyMJ"
     data-rp="0">
  <div class="gs_ggs gs_fl">
    <div class="gs_ggsd">
      <a href="https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3456789">
        <span class="gs_ctg2">[PDF]</span> ssrn.com
      </a>
    </div>
  </div>
  <div class="gs_ri">
    <h3 class="gs_rt">
      <a id="BKeR2rt3wyMJ" href="https://scholar.google.com/scholar_url?url=https://papers.ssrn.com/sol3/papers.cfm%3Fabstract_id%3D3456789&amp;hl=en&amp;sa=T" data-clk="hl=en&amp;sa=T">
        The Effect of Competition on Corporate Disclosure
      </a>
    </h3>
    <div class="gs_a">J Smith, A Johnson, B Williams - Journal of Finance, 2023 - Wiley</div>
    <div class="gs_rs">
      <div class="gs_rs_tbs">
        <b>Competition&#39;s Effect on Bias:</b> Shows that increased product market competition leads firms to reduce optimistic bias in management forecasts and voluntary disclosures.
      </div>
    </div>
    <div class="gs_fl gs_flb">
      <a href="/scholar?cites=12345678901234567890&amp;as_sdt=2005&amp;sciodt=0,5&amp;hl=en">Cited by 42</a>
      <a href="/scholar?q=related:BKeR2rt3wyMJ:scholar.google.com/&amp;scioq=competition+disclosure&amp;hl=en&amp;as_sdt=0,5">Related articles</a>
      <a href="/scholar?cluster=BKeR2rt3wyMJ&amp;hl=en&amp;as_sdt=0,5">All 5 versions</a>
    </div>
  </div>
</div>`;

const CARD_NO_PDF = `<div class="gs_r gs_or gs_scl"
     data-cid="Xp2Lm9kQzFAJ"
     data-did="Xp2Lm9kQzFAJ"
     data-lid=""
     data-aid="Xp2Lm9kQzFAJ"
     data-rp="3">
  <div class="gs_ri">
    <h3 class="gs_rt">
      <a id="Xp2Lm9kQzFAJ" href="https://scholar.google.com/scholar_url?url=https://www.sciencedirect.com/science/article/pii/S0304405X20301422&amp;hl=en&amp;sa=T" data-clk="hl=en&amp;sa=T">
        Voluntary Disclosure and Information Asymmetry
      </a>
    </h3>
    <div class="gs_a">R Verrecchia - Journal of Accounting and Economics, 1983 - Elsevier</div>
    <div class="gs_rs">
      <div class="gs_rs_tbs">
        Foundational model showing how disclosure reduces information asymmetry between firms and investors, establishing the unraveling result under certain conditions.
      </div>
    </div>
    <div class="gs_fl gs_flb">
      <a href="/scholar?cites=98765432109876543210&amp;as_sdt=2005&amp;sciodt=0,5&amp;hl=en">Cited by 3847</a>
      <a href="/scholar?q=related:Xp2Lm9kQzFAJ:scholar.google.com/&amp;scioq=disclosure&amp;hl=en&amp;as_sdt=0,5">Related articles</a>
      <a href="/scholar?cluster=Xp2Lm9kQzFAJ&amp;hl=en&amp;as_sdt=0,5">All 12 versions</a>
    </div>
  </div>
</div>`;

const CARD_NO_CITATIONS = `<div class="gs_r gs_or gs_scl"
     data-cid="Nw3YpQ7RbCsJ"
     data-did="Nw3YpQ7RbCsJ"
     data-lid=""
     data-aid="Nw3YpQ7RbCsJ"
     data-rp="7">
  <div class="gs_ggs gs_fl">
    <div class="gs_ggsd">
      <a href="https://www.nber.org/papers/w31999.pdf">
        <span class="gs_ctg2">[PDF]</span> nber.org
      </a>
    </div>
  </div>
  <div class="gs_ri">
    <h3 class="gs_rt">
      <a id="Nw3YpQ7RbCsJ" href="https://scholar.google.com/scholar_url?url=https://www.nber.org/papers/w31999&amp;hl=en&amp;sa=T" data-clk="hl=en&amp;sa=T">
        AI-Generated Corporate Filings and Market Efficiency
      </a>
    </h3>
    <div class="gs_a">M Chen, L Wei - Working Paper, 2024 - NBER</div>
    <div class="gs_rs">
      <div class="gs_rs_tbs">
        Examines whether AI-generated 10-K filings reduce processing costs for investors and improve price discovery.
      </div>
    </div>
    <div class="gs_fl gs_flb">
      <a href="/scholar?q=related:Nw3YpQ7RbCsJ:scholar.google.com/&amp;scioq=AI+filings&amp;hl=en&amp;as_sdt=0,5">Related articles</a>
      <a href="/scholar?cluster=Nw3YpQ7RbCsJ&amp;hl=en&amp;as_sdt=0,5">All 2 versions</a>
    </div>
  </div>
</div>`;

const CARD_SPECIAL_CHARS = `<div class="gs_r gs_or gs_scl"
     data-cid="AbC123dEfGhJ"
     data-did="AbC123dEfGhJ"
     data-lid=""
     data-aid="AbC123dEfGhJ"
     data-rp="2">
  <div class="gs_ri">
    <h3 class="gs_rt">
      <a id="AbC123dEfGhJ" href="https://scholar.google.com/scholar_url?url=https://onlinelibrary.wiley.com/doi/10.1111/jofi.13456&amp;hl=en&amp;sa=T" data-clk="hl=en&amp;sa=T">
        R&amp;D Investment, Competition &amp; Firm Performance: A Meta&#8208;Analysis
      </a>
    </h3>
    <div class="gs_a">P M&uuml;ller, S O&#39;Brien - Review of Financial Studies, 2022 - Oxford University Press</div>
    <div class="gs_rs">
      <div class="gs_rs_tbs">
        <b>Key Finding:</b> R&amp;D spending in competitive industries yields <b>significantly higher</b> abnormal returns than in concentrated markets.
      </div>
    </div>
    <div class="gs_fl gs_flb">
      <a href="/scholar?cites=11111111111111111111&amp;as_sdt=2005&amp;sciodt=0,5&amp;hl=en">Cited by 156</a>
      <a href="/scholar?q=related:AbC123dEfGhJ:scholar.google.com/">Related articles</a>
    </div>
  </div>
</div>`;

const CARD_SINGLE_AUTHOR = `<div class="gs_r gs_or gs_scl"
     data-cid="ZzYyXxWwVvUJ"
     data-did="ZzYyXxWwVvUJ"
     data-lid=""
     data-aid="ZzYyXxWwVvUJ"
     data-rp="5">
  <div class="gs_ri">
    <h3 class="gs_rt">
      <a id="ZzYyXxWwVvUJ" href="https://scholar.google.com/scholar_url?url=https://www.jstor.org/stable/2951491&amp;hl=en&amp;sa=T" data-clk="hl=en&amp;sa=T">
        Disclosure, Liquidity, and the Cost of Capital
      </a>
    </h3>
    <div class="gs_a">DE Diamond - The Journal of Finance, 1991 - JSTOR</div>
    <div class="gs_rs">
      <div class="gs_rs_tbs">
        Shows that greater disclosure reduces information asymmetry among investors and lowers the cost of capital for the disclosing firm.
      </div>
    </div>
    <div class="gs_fl gs_flb">
      <a href="/scholar?cites=22222222222222222222&amp;as_sdt=2005&amp;sciodt=0,5&amp;hl=en">Cited by 5291</a>
      <a href="/scholar?q=related:ZzYyXxWwVvUJ:scholar.google.com/">Related articles</a>
      <a href="/scholar?cluster=ZzYyXxWwVvUJ&amp;hl=en&amp;as_sdt=0,5">All 8 versions</a>
    </div>
  </div>
</div>`;

// Multi-link fixture: PDF + LibKey link in gs_ggs section
const CARD_MULTI_LINKS = `<div class="gs_r gs_or gs_scl"
     data-cid="MultiLnk123J"
     data-did="MultiLnk123J"
     data-lid=""
     data-aid="MultiLnk123J"
     data-rp="1">
  <div class="gs_ggs gs_fl">
    <div class="gs_ggsd">
      <a href="https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3456789">
        <span class="gs_ctg2">[PDF]</span> ssrn.com
      </a>
    </div>
    <div class="gs_ggsd">
      <a href="https://libkey.io/libraries/1234/openurl?genre=article&amp;doi=10.1234/example">
        <span class="gs_ctg2">[PDF]</span> Full Text @ My University
      </a>
    </div>
  </div>
  <div class="gs_ri">
    <h3 class="gs_rt">
      <a id="MultiLnk123J" href="https://scholar.google.com/scholar_url?url=https://example.com/paper&amp;hl=en&amp;sa=T" data-clk="hl=en&amp;sa=T">
        Multi-Link Paper Title
      </a>
    </h3>
    <div class="gs_a">A Author - Journal of Testing, 2024 - Publisher</div>
    <div class="gs_rs">
      <div class="gs_rs_tbs">
        A paper with multiple full-text links.
      </div>
    </div>
    <div class="gs_fl gs_flb">
      <a href="/scholar?cites=99999999999999999999&amp;as_sdt=2005&amp;sciodt=0,5&amp;hl=en">Cited by 10</a>
      <a href="/scholar?q=related:MultiLnk123J:scholar.google.com/">Related articles</a>
    </div>
  </div>
</div>`;

// LibKey-only link (no [PDF] tag)
const CARD_LIBKEY_ONLY = `<div class="gs_r gs_or gs_scl"
     data-cid="LibKeyOnlyXJ"
     data-did="LibKeyOnlyXJ"
     data-lid=""
     data-aid="LibKeyOnlyXJ"
     data-rp="4">
  <div class="gs_ggs gs_fl">
    <div class="gs_ggsd">
      <a href="https://libkey.io/libraries/1234/openurl?genre=article&amp;doi=10.5555/test">
        Full Text @ My University Library
      </a>
    </div>
  </div>
  <div class="gs_ri">
    <h3 class="gs_rt">
      <a id="LibKeyOnlyXJ" href="https://scholar.google.com/scholar_url?url=https://example.com/article&amp;hl=en&amp;sa=T" data-clk="hl=en&amp;sa=T">
        Library Access Only Paper
      </a>
    </h3>
    <div class="gs_a">B Researcher - Some Journal, 2023 - SomePublisher</div>
    <div class="gs_rs">
      <div class="gs_rs_tbs">
        A paper accessible only through library proxy.
      </div>
    </div>
    <div class="gs_fl gs_flb">
      <a href="/scholar?cites=88888888888888888888&amp;as_sdt=2005&amp;sciodt=0,5&amp;hl=en">Cited by 5</a>
    </div>
  </div>
</div>`;

// Card with HTML tag link (not PDF)
const CARD_HTML_LINK = `<div class="gs_r gs_or gs_scl"
     data-cid="HtmlTagLnkXJ"
     data-did="HtmlTagLnkXJ"
     data-lid=""
     data-aid="HtmlTagLnkXJ"
     data-rp="6">
  <div class="gs_ggs gs_fl">
    <div class="gs_ggsd">
      <a href="https://www.sciencedirect.com/science/article/pii/S0000000000000000">
        <span class="gs_ctg2">[HTML]</span> sciencedirect.com
      </a>
    </div>
  </div>
  <div class="gs_ri">
    <h3 class="gs_rt">
      <a id="HtmlTagLnkXJ" href="https://scholar.google.com/scholar_url?url=https://example.com/html-article&amp;hl=en&amp;sa=T" data-clk="hl=en&amp;sa=T">
        HTML Link Paper
      </a>
    </h3>
    <div class="gs_a">C Writer - Another Journal, 2022 - AnotherPub</div>
    <div class="gs_rs">
      <div class="gs_rs_tbs">
        A paper with an HTML full-text link.
      </div>
    </div>
    <div class="gs_fl gs_flb">
      <a href="/scholar?cites=77777777777777777777&amp;as_sdt=2005&amp;sciodt=0,5&amp;hl=en">Cited by 20</a>
    </div>
  </div>
</div>`;

// Card with institutional link in footer (gs_fl gs_flb)
const CARD_FOOTER_LIBKEY = `<div class="gs_r gs_or gs_scl"
     data-cid="FooterLnk99J"
     data-did="FooterLnk99J"
     data-lid=""
     data-aid="FooterLnk99J"
     data-rp="2">
  <div class="gs_ri">
    <h3 class="gs_rt">
      <a id="FooterLnk99J" href="https://scholar.google.com/scholar_url?url=https://example.com/footer-paper&amp;hl=en&amp;sa=T" data-clk="hl=en&amp;sa=T">
        Footer LibKey Paper
      </a>
    </h3>
    <div class="gs_a">D Scholar - Fancy Journal, 2021 - BigPublisher</div>
    <div class="gs_rs">
      <div class="gs_rs_tbs">
        A paper with an institutional link only in the footer.
      </div>
    </div>
    <div class="gs_fl gs_flb">
      <a href="/scholar?cites=66666666666666666666&amp;as_sdt=2005&amp;sciodt=0,5&amp;hl=en">Cited by 100</a>
      <a href="/scholar?q=related:FooterLnk99J:scholar.google.com/">Related articles</a>
      <a href="https://libkey.io/libraries/5678/openurl?genre=article&amp;doi=10.9999/footer">Full Text @ MyLib</a>
      <a href="/scholar?cluster=FooterLnk99J&amp;hl=en&amp;as_sdt=0,5">All 3 versions</a>
    </div>
  </div>
</div>`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseResultCard", () => {
  it("parses a full result card with all fields", () => {
    const result = parseResultCard(FULL_CARD_HTML, 0);

    expect(result.title).toBe(
      "The Effect of Competition on Corporate Disclosure"
    );
    expect(result.authors).toBe("J Smith, A Johnson, B Williams");
    expect(result.journal).toBe("Journal of Finance");
    expect(result.year).toBe("2023");
    expect(result.publisher).toBe("Wiley");
    expect(result.snippet).toContain(
      "Shows that increased product market competition leads firms"
    );
    expect(result.url).toBe(
      "https://scholar.google.com/scholar_url?url=https://papers.ssrn.com/sol3/papers.cfm%3Fabstract_id%3D3456789&hl=en&sa=T"
    );
    expect(result.pdfUrl).toBe(
      "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3456789"
    );
    expect(result.citations).toBe(42);
    expect(result.clusterId).toBe("BKeR2rt3wyMJ");
    expect(result.position).toBe(0);
  });

  it("returns pdfUrl as null when no gs_ggs section exists", () => {
    const result = parseResultCard(CARD_NO_PDF, 3);

    expect(result.title).toBe(
      "Voluntary Disclosure and Information Asymmetry"
    );
    expect(result.pdfUrl).toBeNull();
    expect(result.authors).toBe("R Verrecchia");
    expect(result.journal).toBe("Journal of Accounting and Economics");
    expect(result.year).toBe("1983");
    expect(result.publisher).toBe("Elsevier");
    expect(result.citations).toBe(3847);
    expect(result.clusterId).toBe("Xp2Lm9kQzFAJ");
    expect(result.position).toBe(3);
  });

  it("returns citations as 0 when no Cited by link exists", () => {
    const result = parseResultCard(CARD_NO_CITATIONS, 7);

    expect(result.title).toBe(
      "AI-Generated Corporate Filings and Market Efficiency"
    );
    expect(result.citations).toBe(0);
    expect(result.authors).toBe("M Chen, L Wei");
    expect(result.journal).toBe("Working Paper");
    expect(result.year).toBe("2024");
    expect(result.publisher).toBe("NBER");
    expect(result.pdfUrl).toBe("https://www.nber.org/papers/w31999.pdf");
    expect(result.position).toBe(7);
  });

  it("handles HTML entities and special characters in title", () => {
    const result = parseResultCard(CARD_SPECIAL_CHARS, 2);

    // &amp; should be decoded to &, &#8208; is a hyphen
    expect(result.title).toContain("R&D Investment");
    expect(result.title).toContain("Competition & Firm Performance");
    expect(result.citations).toBe(156);
    expect(result.clusterId).toBe("AbC123dEfGhJ");
    expect(result.position).toBe(2);
  });

  it("strips bold tags from snippet text", () => {
    const result = parseResultCard(CARD_SPECIAL_CHARS, 2);

    // <b> tags should be stripped
    expect(result.snippet).not.toContain("<b>");
    expect(result.snippet).not.toContain("</b>");
    expect(result.snippet).toContain("Key Finding:");
    expect(result.snippet).toContain("significantly higher");
  });

  it("parses single author correctly", () => {
    const result = parseResultCard(CARD_SINGLE_AUTHOR, 5);

    expect(result.authors).toBe("DE Diamond");
    expect(result.journal).toBe("The Journal of Finance");
    expect(result.year).toBe("1991");
    expect(result.publisher).toBe("JSTOR");
    expect(result.citations).toBe(5291);
    expect(result.position).toBe(5);
  });

  it("extracts year from gs_a text", () => {
    const result = parseResultCard(FULL_CARD_HTML, 0);
    expect(result.year).toBe("2023");

    const result2 = parseResultCard(CARD_SINGLE_AUTHOR, 5);
    expect(result2.year).toBe("1991");
  });

  it("handles empty HTML gracefully", () => {
    const result = parseResultCard("", 0);

    expect(result.title).toBe("");
    expect(result.authors).toBe("");
    expect(result.journal).toBe("");
    expect(result.year).toBe("");
    expect(result.publisher).toBe("");
    expect(result.snippet).toBe("");
    expect(result.url).toBe("");
    expect(result.pdfUrl).toBeNull();
    expect(result.citations).toBe(0);
    expect(result.clusterId).toBe("");
    expect(result.position).toBe(0);
  });

  it("decodes &amp; entities in URLs", () => {
    const result = parseResultCard(FULL_CARD_HTML, 0);

    // The href contains &amp; which should be decoded to &
    expect(result.url).toContain("&hl=en&sa=T");
    expect(result.url).not.toContain("&amp;");
  });
});

describe("parseResultCards", () => {
  it("parses an array of {h, i} finding objects", () => {
    const findings = [
      { h: FULL_CARD_HTML, i: 0 },
      { h: CARD_NO_PDF, i: 3 },
      { h: CARD_NO_CITATIONS, i: 7 },
    ];

    const results = parseResultCards(findings);

    expect(results).toHaveLength(3);
    expect(results[0].title).toBe(
      "The Effect of Competition on Corporate Disclosure"
    );
    expect(results[0].position).toBe(0);
    expect(results[1].title).toBe(
      "Voluntary Disclosure and Information Asymmetry"
    );
    expect(results[1].position).toBe(3);
    expect(results[2].title).toBe(
      "AI-Generated Corporate Filings and Market Efficiency"
    );
    expect(results[2].position).toBe(7);
  });

  it("returns empty array for empty input", () => {
    const results = parseResultCards([]);
    expect(results).toHaveLength(0);
  });

  it("uses the i field from findings as the position", () => {
    const findings = [{ h: CARD_SINGLE_AUTHOR, i: 9 }];

    const results = parseResultCards(findings);

    expect(results).toHaveLength(1);
    expect(results[0].position).toBe(9);
    expect(results[0].title).toBe(
      "Disclosure, Liquidity, and the Cost of Capital"
    );
  });
});

// ---------------------------------------------------------------------------
// fullTextLinks tests
// ---------------------------------------------------------------------------

describe("parseResultCard fullTextLinks", () => {
  it("parses multiple gs_ggsd entries into fullTextLinks array", () => {
    const result = parseResultCard(CARD_MULTI_LINKS, 1);

    expect(result.fullTextLinks).toHaveLength(2);

    expect(result.fullTextLinks[0].url).toBe(
      "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3456789"
    );
    expect(result.fullTextLinks[0].label).toBe("[PDF] ssrn.com");
    expect(result.fullTextLinks[0].type).toBe("pdf");

    expect(result.fullTextLinks[1].url).toBe(
      "https://libkey.io/libraries/1234/openurl?genre=article&doi=10.1234/example"
    );
    expect(result.fullTextLinks[1].label).toBe(
      "[PDF] Full Text @ My University"
    );
    expect(result.fullTextLinks[1].type).toBe("pdf");
  });

  it("maintains backward compat: pdfUrl is first pdf-type link URL", () => {
    const result = parseResultCard(CARD_MULTI_LINKS, 1);

    expect(result.pdfUrl).toBe(
      "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3456789"
    );
  });

  it("returns empty fullTextLinks array when no gs_ggs section exists", () => {
    const result = parseResultCard(CARD_NO_PDF, 3);

    expect(result.fullTextLinks).toEqual([]);
    expect(result.pdfUrl).toBeNull();
  });

  it("parses LibKey-only link with no PDF tag as type 'link'", () => {
    const result = parseResultCard(CARD_LIBKEY_ONLY, 4);

    expect(result.fullTextLinks).toHaveLength(1);
    expect(result.fullTextLinks[0].url).toBe(
      "https://libkey.io/libraries/1234/openurl?genre=article&doi=10.5555/test"
    );
    expect(result.fullTextLinks[0].label).toBe(
      "Full Text @ My University Library"
    );
    expect(result.fullTextLinks[0].type).toBe("link");
    // pdfUrl falls back to first link when no pdf-type links exist
    expect(result.pdfUrl).toBe(
      "https://libkey.io/libraries/1234/openurl?genre=article&doi=10.5555/test"
    );
  });

  it("detects [HTML] tag and sets type to 'html'", () => {
    const result = parseResultCard(CARD_HTML_LINK, 6);

    expect(result.fullTextLinks).toHaveLength(1);
    expect(result.fullTextLinks[0].url).toBe(
      "https://www.sciencedirect.com/science/article/pii/S0000000000000000"
    );
    expect(result.fullTextLinks[0].label).toBe("[HTML] sciencedirect.com");
    expect(result.fullTextLinks[0].type).toBe("html");
  });

  it("captures institutional links from gs_fl footer", () => {
    const result = parseResultCard(CARD_FOOTER_LIBKEY, 2);

    // No gs_ggs section, but there is a footer link
    expect(result.fullTextLinks).toHaveLength(1);
    expect(result.fullTextLinks[0].url).toBe(
      "https://libkey.io/libraries/5678/openurl?genre=article&doi=10.9999/footer"
    );
    expect(result.fullTextLinks[0].label).toBe("Full Text @ MyLib");
    expect(result.fullTextLinks[0].type).toBe("link");
    // pdfUrl falls back to the footer link
    expect(result.pdfUrl).toBe(
      "https://libkey.io/libraries/5678/openurl?genre=article&doi=10.9999/footer"
    );
  });

  it("returns empty fullTextLinks for empty HTML", () => {
    const result = parseResultCard("", 0);
    expect(result.fullTextLinks).toEqual([]);
  });

  it("existing single-link cards populate fullTextLinks correctly", () => {
    // The existing FULL_CARD_HTML has one PDF link
    const result = parseResultCard(FULL_CARD_HTML, 0);

    expect(result.fullTextLinks).toHaveLength(1);
    expect(result.fullTextLinks[0].url).toBe(
      "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3456789"
    );
    expect(result.fullTextLinks[0].label).toBe("[PDF] ssrn.com");
    expect(result.fullTextLinks[0].type).toBe("pdf");
    // pdfUrl backward compat
    expect(result.pdfUrl).toBe(
      "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3456789"
    );
  });
});
