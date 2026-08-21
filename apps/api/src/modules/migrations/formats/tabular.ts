export interface TabularTable {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      result.push(current.trim()); current = "";
    } else current += char;
  }
  result.push(current.trim());
  return result;
}

export function parseCsv(name: string, buffer: Buffer, maxRows = 250_000): TabularTable {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { name, headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]!).map((header, index) => header || `column_${index + 1}`);
  if (lines.length - 1 > maxRows) throw new Error(`CSV has too many rows: ${name}`);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? null]));
  });
  return { name, headers, rows };
}

export function parseJson(name: string, buffer: Buffer): TabularTable {
  const value: unknown = JSON.parse(buffer.toString("utf8"));
  const rows = Array.isArray(value) ? value : typeof value === "object" && value !== null && Array.isArray((value as { data?: unknown }).data) ? (value as { data: unknown[] }).data : [];
  const objects = rows.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null && !Array.isArray(row));
  const headerSet = new Set<string>();
  for (const row of objects) Object.keys(row).forEach((key) => headerSet.add(key));
  const headers = [...headerSet];
  return { name, headers, rows: objects };
}
