const DANGEROUS_SPREADSHEET_PREFIX = /^[\t\r ]*[+\-=@]/u;

function safeSpreadsheetValue(value: string): string {
  return DANGEROUS_SPREADSHEET_PREFIX.test(value) ? `'${value}` : value;
}

function csvCell(value: string): string {
  return `"${safeSpreadsheetValue(value).replaceAll('"', '""')}"`;
}

export function createCsv(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
