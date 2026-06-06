// Tiny, dependency-free CSV serializer (pure + testable). Quotes any field that
// contains a comma, quote, CR or LF, doubling embedded quotes per RFC 4180.

export function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}
