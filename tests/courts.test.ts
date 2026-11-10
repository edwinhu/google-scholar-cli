import { describe, expect, test } from "bun:test";
import { normalizeCourt, resolveCourts, caseLawSdt, listCourts } from "../src/util/courts";

describe("normalizeCourt", () => {
  test("expands citation abbreviations", () => {
    expect(normalizeCourt("10th Cir.")).toBe("10th circuit");
    expect(normalizeCourt("Utah Ct. App.")).toBe("utah court of appeals");
    expect(normalizeCourt("D. Utah")).toBe("d utah");
    expect(normalizeCourt("D.C. Cir.")).toBe("dc circuit");
  });
});

describe("resolveCourts", () => {
  test("resolves states, state courts, circuits and districts", () => {
    expect(resolveCourts(["utah"]).ids).toEqual(["45"]);
    expect(resolveCourts(["Utah Supreme Court"]).ids).toEqual(["243"]);
    expect(resolveCourts(["ca10"]).ids).toEqual(["120", "106"]);
    expect(resolveCourts(["10th Cir. Court of Appeals"]).ids).toEqual(["120", "106"]);
    expect(resolveCourts(["D. Utah"]).ids).toEqual(["161"]);
    expect(resolveCourts(["scotus"]).ids).toEqual(["60"]);
  });
  test("passes numeric IDs through and de-duplicates", () => {
    expect(resolveCourts(["45", "utah", "120,106"]).ids).toEqual(["45", "120", "106"]);
  });
  test("reports unknown names", () => {
    expect(resolveCourts(["narnia"]).unknown).toEqual(["narnia"]);
  });
  test("D.C. district is reachable through its circuit", () => {
    expect(resolveCourts(["dc circuit dist of columbia"]).ids).toEqual(["140"]);
  });
});

describe("caseLawSdt", () => {
  test("all courts vs selected courts", () => {
    expect(caseLawSdt([])).toBe("2006");
    expect(caseLawSdt(["45", "120"])).toBe("4,45,120");
  });
});

test("listCourts filters by name", () => {
  const names = listCourts("utah").map(([k]) => k);
  expect(names).toContain("utah");
  expect(names).toContain("d utah");
});

import { parseResultCard } from "../src/util/html";

test("case byline: citation, court and decision year (not a reporter page)", () => {
  const html =
    '<div class="gs_r gs_or gs_scl" data-cid="x" data-rp="0"><div class="gs_ri">' +
    '<h3 class="gs_rt"><a href="/scholar_case?case=1">State v. Dunn</a></h3>' +
    '<div class="gs_a">850 P. 2d 1201&nbsp;- Utah: Supreme Court, 1993 - Google Scholar</div></div></div>';
  const r = parseResultCard(html, 0);
  expect(r.authors).toBe("850 P. 2d 1201");
  expect(r.journal).toBe("Utah: Supreme Court");
  expect(r.year).toBe("1993");
});
