export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length))
  );
  const sep = "  ";
  const header = headers.map((h, i) => h.padEnd(widths[i])).join(sep);
  const divider = widths.map((w) => "-".repeat(w)).join(sep);

  console.log(header);
  console.log(divider);
  for (const row of rows) {
    console.log(row.map((c, i) => (c ?? "").padEnd(widths[i])).join(sep));
  }
}

export function printError(msg: string): void {
  console.error(`error: ${msg}`);
}

export function printProgress(msg: string): void {
  process.stderr.write(`\r\x1b[K${msg}`);
}
