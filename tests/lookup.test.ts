import { describe, it, expect } from "bun:test";
import { parseResultCards as parseLabsCards } from "../src/util/html.js";

const REPO_ROOT = new URL("..", import.meta.url).pathname;

// Test that CLI integration works for the lookup command
describe("CLI lookup", () => {
  it("scholar lookup --help exits 0", async () => {
    const proc = Bun.spawn([process.execPath, "run", "src/main.ts", "lookup", "--help"], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stdout).toContain("lookup");
  });

  it("scholar lookup without query exits 1", async () => {
    const proc = Bun.spawn([process.execPath, "run", "src/main.ts", "lookup"], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(1);
    expect(stderr).toContain("No query provided");
  });
});

// Test that parseScholarPage extracts result cards from a full HTML page
describe("parseScholarPage", () => {
  it("extracts multiple result cards from full page HTML", async () => {
    const { parseScholarPage } = await import("../src/util/html.js");

    const pageHtml = `
      <html>
      <body>
        <div id="gs_res_ccl_mid">
          <div class="gs_r gs_or gs_scl" data-cid="ABC123" data-rp="0">
            <div class="gs_ri">
              <h3 class="gs_rt"><a href="https://example.com/paper1">First Paper Title</a></h3>
              <div class="gs_a">A Smith, B Jones - Nature, 2023 - Springer</div>
              <div class="gs_rs"><div class="gs_rs_tbs">This is the first snippet.</div></div>
              <div class="gs_fl"><a href="#">Cited by 42</a></div>
            </div>
          </div>
          <div class="gs_r gs_or gs_scl" data-cid="DEF456" data-rp="1">
            <div class="gs_ri">
              <h3 class="gs_rt"><a href="https://example.com/paper2">Second Paper Title</a></h3>
              <div class="gs_a">C Lee - Science, 2022 - AAAS</div>
              <div class="gs_rs"><div class="gs_rs_tbs">This is the second snippet.</div></div>
              <div class="gs_fl"><a href="#">Cited by 100</a></div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const results = parseScholarPage(pageHtml);

    expect(results.length).toBe(2);
    expect(results[0].title).toBe("First Paper Title");
    expect(results[0].authors).toBe("A Smith, B Jones");
    expect(results[0].year).toBe("2023");
    expect(results[0].citations).toBe(42);
    expect(results[0].position).toBe(0);

    expect(results[1].title).toBe("Second Paper Title");
    expect(results[1].authors).toBe("C Lee");
    expect(results[1].year).toBe("2022");
    expect(results[1].citations).toBe(100);
    expect(results[1].position).toBe(1);
  });

  it("returns empty array for page with no results", async () => {
    const { parseScholarPage } = await import("../src/util/html.js");

    const pageHtml = `<html><body><div id="gs_res_ccl_mid"></div></body></html>`;
    const results = parseScholarPage(pageHtml);
    expect(results.length).toBe(0);
  });

  it("handles deeply nested real Scholar HTML (8 divs per card)", async () => {
    const { parseScholarPage } = await import("../src/util/html.js");

    // Real Scholar cards have ~8 nested divs (gs_ggs, gs_ri, gs_fl, etc.)
    const pageHtml = `
      <div id="gs_res_ccl_mid">
        <div class="gs_r gs_or gs_scl" data-cid="X1" data-rp="0">
          <div class="gs_ggs gs_fl"><div class="gs_ggsd"><div class="gs_or_ggsm">
            <a href="https://example.com/paper.pdf">[PDF]</a>
          </div></div></div>
          <div class="gs_ri">
            <h3 class="gs_rt"><a href="https://example.com/paper">Deep Nesting Paper</a></h3>
            <div class="gs_a">J Doe, A Author - Journal, 2024 - Publisher</div>
            <div class="gs_rs"><div class="gs_rs_tbs">Snippet text here.</div></div>
            <div class="gs_fl gs_flb">
              <a href="#">Cited by 55</a>
            </div>
          </div>
        </div>
      </div>`;

    const results = parseScholarPage(pageHtml);
    expect(results.length).toBe(1);
    expect(results[0].title).toBe("Deep Nesting Paper");
    expect(results[0].authors).toBe("J Doe, A Author");
    expect(results[0].year).toBe("2024");
    expect(results[0].citations).toBe(55);
    expect(results[0].pdfUrl).toBe("https://example.com/paper.pdf");
  });

  it("extracts result count from page", async () => {
    const { parseResultCount } = await import("../src/util/html.js");

    const html = `<div id="gs_ab_md"><div class="gs_ab_mdw">About 12,300 results</div></div>`;
    expect(parseResultCount(html)).toBe("About 12,300 results");
  });
});
