/**
 * Parse TSV content into headers and row objects.
 * @param {string} content
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
export function parseTsv(content) {
  const lines = content.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0].split("\t").map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (cols[j] || "").trim();
    }
    rows.push(row);
  }

  return { headers, rows };
}
