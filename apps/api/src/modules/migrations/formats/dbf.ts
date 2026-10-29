import iconv from "iconv-lite";
export interface DbfField {
  name: string;
  type: string;
  length: number;
  decimals: number;
}

export interface DbfTable {
  name: string;
  fields: DbfField[];
  rows: Record<string, unknown>[];
}

export interface DbfHeader {
  name: string;
  recordCount: number;
  headerLength: number;
  recordLength: number;
  fields: DbfField[];
}

export function readDbfHeader(name: string, buffer: Buffer): DbfHeader {
  if (buffer.length < 32) throw new Error(`Invalid DBF: ${name}`);

  const recordCount = buffer.readUInt32LE(4);
  const headerLength = buffer.readUInt16LE(8);
  const recordLength = buffer.readUInt16LE(10);

  if (
    headerLength < 33 ||
    recordLength < 2 ||
    headerLength > buffer.length
  ) {
    throw new Error(`Invalid DBF header: ${name}`);
  }

  const fields: DbfField[] = [];

  for (let offset = 32; offset + 32 <= headerLength; offset += 32) {
    if (buffer[offset] === 0x0d) break;

    const descriptor = buffer.subarray(offset, offset + 32);
    const fieldName = descriptor
      .subarray(0, 11)
      .toString("ascii")
      .replaceAll("\0", "")
      .trim();

    if (!fieldName) continue;

    fields.push({
      name: fieldName.toUpperCase(),
      type: String.fromCharCode(descriptor[11] ?? 32),
      length: descriptor[16] ?? 0,
      decimals: descriptor[17] ?? 0,
    });
  }

  return {
    name,
    recordCount,
    headerLength,
    recordLength,
    fields,
  };
}

function readIntLE(buffer: Buffer, offset: number, length: number): number {
  if (length === 4) return buffer.readInt32LE(offset);
  if (length === 2) return buffer.readInt16LE(offset);
  return Number(buffer.subarray(offset, offset + length).toString("ascii").trim() || "0");
}

function readMemo(memoBuffer: Buffer | undefined, blockNumber: number): string {
  if (!memoBuffer || !blockNumber) return "";
  if (memoBuffer.length < 512) return "";
  const blockSize = memoBuffer.readUInt16BE(6) || 512;
  let offset = blockNumber * blockSize;
  if (offset + 8 > memoBuffer.length) return "";
  const declaredLength = memoBuffer.readUInt32BE(offset + 4);
  offset += 8;
  if (!declaredLength) return "";
  const chunks: Buffer[] = [];
  let remaining = declaredLength;
  while (remaining > 0 && offset < memoBuffer.length) {
    const length = Math.min(remaining, blockSize - (offset % blockSize));
    if (length <= 0) break;
    chunks.push(memoBuffer.subarray(offset, Math.min(offset + length, memoBuffer.length)));
    remaining -= chunks[chunks.length - 1]!.length;
    offset += blockSize;
  }
return iconv.decode(Buffer.concat(chunks), "windows-1252").replaceAll("\0", "").trim();
}

function parseValue(raw: Buffer, field: DbfField, memoBuffer?: Buffer): unknown {
const text = iconv.decode(raw, "windows-1252").replaceAll("\0", "").trim();
  if (field.type === "C" || field.type === "G" || field.type === "P") return text;
  if (field.type === "M") return readMemo(memoBuffer, raw.length >= 4 ? raw.readInt32LE(0) : 0);
  if (field.type === "L") return /^(y|t|1)$/i.test(text);
  if (field.type === "D") {
    if (!/^\d{8}$/.test(text)) return null;
    const y = Number(text.slice(0, 4));
    const m = Number(text.slice(4, 6)) - 1;
    const d = Number(text.slice(6, 8));
    return new Date(Date.UTC(y, m, d)).toISOString();
  }
  if (field.type === "N" || field.type === "F") {
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
  }
  if (field.type === "I") return readIntLE(raw, 0, 4);
  if (field.type === "B") return raw.length === 8 ? raw.readDoubleLE(0) : null;
  if (field.type === "T" && raw.length >= 8) {
    const julianDay = raw.readInt32LE(0);
    const milliseconds = raw.readInt32LE(4);
    if (!julianDay) return null;
    const unixDays = julianDay - 2_440_588;
    return new Date(unixDays * 86_400_000 + milliseconds).toISOString();
  }
  return text;
}

export function parseDbf(name: string, buffer: Buffer, maxRows = 250_000, memoBuffer?: Buffer): DbfTable {
  const header = readDbfHeader(name, buffer);
  const { recordCount, headerLength, recordLength, fields } = header;

  if (recordCount > maxRows) throw new Error(`DBF has too many rows: ${name}`);

  const rows: Record<string, unknown>[] = [];
  for (let rowIndex = 0; rowIndex < recordCount; rowIndex += 1) {
    const start = headerLength + rowIndex * recordLength;
    const end = start + recordLength;
    if (end > buffer.length) break;
    const record = buffer.subarray(start, end);
    if (record[0] === 0x2a) continue;
    let fieldOffset = 1;
    const row: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = record.subarray(fieldOffset, fieldOffset + field.length);
      fieldOffset += field.length;
      row[field.name] = parseValue(raw, field, memoBuffer);
    }
    rows.push(row);
  }

  return { name, fields, rows };
}
