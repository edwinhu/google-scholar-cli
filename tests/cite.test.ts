import { describe, it, expect } from "bun:test";

const REPO_ROOT = new URL("..", import.meta.url).pathname;

describe("extractBibtexUrl", () => {
  it("extracts the BibTeX URL from a Scholar citation popup HTML", async () => {
    const { extractBibtexUrl } = await import("../src/util/bibtex.js");

    const html = `
      <div class="gs_citr">
        <a class="gs_citi" href="https://scholar.googleusercontent.com/scholar.enw?q=info:abc123:scholar.google.com/">EndNote</a>
        <a class="gs_citi" href="https://scholar.googleusercontent.com/scholar.bib?q=info:abc123:scholar.google.com/">BibTeX</a>
        <a class="gs_citi" href="https://scholar.googleusercontent.com/scholar.ris?q=info:abc123:scholar.google.com/">RefMan</a>
      </div>
    `;

    const url = extractBibtexUrl(html);
    expect(url).toBe(
      "https://scholar.googleusercontent.com/scholar.bib?q=info:abc123:scholar.google.com/",
    );
  });

  it("returns null when no BibTeX link is found", async () => {
    const { extractBibtexUrl } = await import("../src/util/bibtex.js");

    const html = `
      <div class="gs_citr">
        <a class="gs_citi" href="/scholar.enw">EndNote</a>
        <a class="gs_citi" href="/scholar.ris">RefMan</a>
      </div>
    `;

    const url = extractBibtexUrl(html);
    expect(url).toBeNull();
  });

  it("returns null for empty HTML", async () => {
    const { extractBibtexUrl } = await import("../src/util/bibtex.js");

    const url = extractBibtexUrl("");
    expect(url).toBeNull();
  });

  it("handles HTML with single-quoted or unquoted attributes", async () => {
    const { extractBibtexUrl } = await import("../src/util/bibtex.js");

    const html = `
      <a class="gs_citi" href="https://scholar.google.com/scholar.bib?q=info:xyz789:scholar.google.com/">BibTeX</a>
    `;

    const url = extractBibtexUrl(html);
    expect(url).toBe(
      "https://scholar.google.com/scholar.bib?q=info:xyz789:scholar.google.com/",
    );
  });
});

describe("injectAbstract", () => {
  it("injects abstract into a standard BibTeX entry", async () => {
    const { injectAbstract } = await import("../src/util/bibtex.js");

    const bibtex = `@article{author2023title,
  title={Paper Title},
  author={Author, First},
  year={2023}
}`;

    const result = injectAbstract(bibtex, "We study the effects of X on Y.");

    expect(result).toBe(`@article{author2023title,
  title={Paper Title},
  author={Author, First},
  year={2023},
  abstract={We study the effects of X on Y.}
}`);
  });

  it("returns BibTeX unchanged when abstract is empty", async () => {
    const { injectAbstract } = await import("../src/util/bibtex.js");

    const bibtex = `@article{author2023title,
  title={Paper Title},
  author={Author, First},
  year={2023}
}`;

    expect(injectAbstract(bibtex, "")).toBe(bibtex);
    expect(injectAbstract(bibtex, "  ")).toBe(bibtex);
  });

  it("handles BibTeX where last field has a trailing comma", async () => {
    const { injectAbstract } = await import("../src/util/bibtex.js");

    const bibtex = `@article{author2023title,
  title={Paper Title},
  author={Author, First},
  year={2023},
}`;

    const result = injectAbstract(bibtex, "Some abstract text.");

    expect(result).toBe(`@article{author2023title,
  title={Paper Title},
  author={Author, First},
  year={2023},
  abstract={Some abstract text.}
}`);
  });

  it("escapes curly braces in abstract text", async () => {
    const { injectAbstract } = await import("../src/util/bibtex.js");

    const bibtex = `@article{author2023title,
  title={Paper Title},
  year={2023}
}`;

    const result = injectAbstract(bibtex, "We use {LaTeX} and } stuff");

    expect(result).toContain("abstract={We use \\{LaTeX\\} and \\} stuff}");
  });

  it("trims whitespace from abstract", async () => {
    const { injectAbstract } = await import("../src/util/bibtex.js");

    const bibtex = `@article{author2023title,
  title={Paper Title},
  year={2023}
}`;

    const result = injectAbstract(bibtex, "  Some abstract text.  ");

    expect(result).toContain("abstract={Some abstract text.}");
  });
});

describe("CLI --bibtex flag", () => {
  it("scholar search --bibtex --help exits 0 and mentions bibtex", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/main.ts", "search", "--bibtex", "--help"],
      {
        cwd: REPO_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stdout).toContain("--bibtex");
  });

  it("scholar lookup --bibtex --help exits 0 and mentions bibtex", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/main.ts", "lookup", "--bibtex", "--help"],
      {
        cwd: REPO_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stdout).toContain("--bibtex");
  });

  it("global --help mentions --bibtex flag", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/main.ts", "--help"],
      {
        cwd: REPO_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stdout).toContain("--bibtex");
  });
});

describe("CLI cite", () => {
  it("scholar cite --help exits 0 with usage text", async () => {
    const proc = Bun.spawn([process.execPath, "run", "src/main.ts", "cite", "--help"], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stdout).toContain("cite");
    expect(stdout).toContain("clusterId");
  });

  it("scholar cite without arguments exits 1 with error", async () => {
    const proc = Bun.spawn([process.execPath, "run", "src/main.ts", "cite"], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(1);
    expect(stderr).toContain("No cluster ID");
  });
});
