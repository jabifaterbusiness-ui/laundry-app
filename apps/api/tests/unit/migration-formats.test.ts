import { describe, expect, it } from "vitest";
import { parseCsv, parseJson } from "../../src/modules/migrations/formats/tabular.js";
import { parseDbf } from "../../src/modules/migrations/formats/dbf.js";

function dbfFixture(): Buffer {
  const fields = [
    { name: "FNAME", type: "C", length: 10, decimals: 0 },
    { name: "LNAME", type: "C", length: 10, decimals: 0 },
    { name: "CPHONE", type: "C", length: 15, decimals: 0 },
  ];
  const recordLength = 1 + fields.reduce((sum, field) => sum + field.length, 0);
  const headerLength = 32 + fields.length * 32 + 1;
  const rows = ["Jane      Doe       08012345678    ", "Peter     Jabi      08098765432    "];
  const buffer = Buffer.alloc(headerLength + rows.length * recordLength + 1, 0);
  buffer[0] = 0x03;
  buffer.writeUInt32LE(rows.length, 4);
  buffer.writeUInt16LE(headerLength, 8);
  buffer.writeUInt16LE(recordLength, 10);
  let fieldOffset = 32;
  for (const field of fields) {
    buffer.write(field.name, fieldOffset, "ascii");
    buffer[fieldOffset + 11] = field.type.charCodeAt(0);
    buffer[fieldOffset + 16] = field.length;
    fieldOffset += 32;
  }
  buffer[fieldOffset] = 0x0d;
  for (let row = 0; row < rows.length; row += 1) {
    const start = headerLength + row * recordLength;
    buffer[start] = 0x20;
    buffer.write(rows[row]!, start + 1, "ascii");
  }
  buffer[buffer.length - 1] = 0x1a;
  return buffer;
}


describe("migration format readers", () => {
  it("reads DBF customer fields", () => {
    const table = parseDbf("CUSTOMER.DBF", dbfFixture());
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]).toMatchObject({ FNAME: "Jane", LNAME: "Doe", CPHONE: "08012345678" });
  });

  it("reads CSV rows", () => {
    const table = parseCsv("customers.csv", Buffer.from('name,phone\n"Jane Doe",08012345678\n'));
    expect(table.rows[0]).toEqual({ name: "Jane Doe", phone: "08012345678" });
  });

  it("reads JSON arrays and {data: []} envelopes", () => {
    expect(parseJson("customers.json", Buffer.from(JSON.stringify([{ name: "Jane" }]))).rows).toEqual([{ name: "Jane" }]);
    expect(parseJson("customers.json", Buffer.from(JSON.stringify({ data: [{ name: "Peter" }] }))).rows).toEqual([{ name: "Peter" }]);
  });
});
