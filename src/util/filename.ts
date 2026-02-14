/**
 * Sanitize a paper title into a safe filename.
 *
 * - Removes special characters (keeps alphanumeric, spaces, hyphens, dots, underscores)
 * - Converts spaces to underscores
 * - Collapses multiple underscores
 * - Trims leading/trailing underscores
 * - Truncates to 200 characters
 * - Falls back to "paper" if result is empty
 */
export function sanitizeFilename(title: string): string {
  return (
    title
      .replace(/[^a-zA-Z0-9\s\-_.]/g, "") // remove special chars
      .replace(/\s+/g, "_") // spaces to underscores
      .replace(/_+/g, "_") // collapse multiple underscores
      .replace(/^_|_$/g, "") // trim leading/trailing underscores
      .slice(0, 200) || "paper" // limit length, fallback
  );
}
