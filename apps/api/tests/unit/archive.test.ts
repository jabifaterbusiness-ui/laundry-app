import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { readZip } from "../../src/modules/migrations/archive.js";

function zipFixture(name: string, content: Buffer, method: 0 | 8 = 0): Buffer {
  const nameBytes = Buffer.from(name);
  const compressed = method === 8 ? deflateRawSync(content) : content;
  const local = Buffer.alloc(30 + nameBytes.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(0, 10);
  local.writeUInt32LE(0, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  nameBytes.copy(local, 30);

  const central = Buffer.alloc(46 + nameBytes.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(0, 12);
  central.writeUInt32LE(0, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  nameBytes.copy(central, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length + compressed.length, 16);

  return Buffer.concat([local, compressed, central, eocd]);
}

describe("ZIP archive safety", () => {
  it("reads a stored entry", () => {
    const zip = zipFixture("customers.csv", Buffer.from("name\nJane\n"));
    expect(readZip(zip)[0]).toMatchObject({
      path: "customers.csv",
      data: Buffer.from("name\nJane\n"),
    });
  });

  it("reads a deflated entry within the configured limit", () => {
    const zip = zipFixture("customers.csv", Buffer.from("Jane ".repeat(100)), 8);
    expect(readZip(zip, { maxFiles: 5, maxUncompressedBytes: 1000 })[0]?.data.length).toBe(500);
  });

  it("rejects an empty or truncated archive without leaking a RangeError", () => {
    expect(() => readZip(Buffer.alloc(0))).toThrow(/invalid zip/i);
    expect(() => readZip(Buffer.alloc(12))).toThrow(/invalid zip/i);
  });

  it("rejects traversal paths", () => {
    expect(() => readZip(zipFixture("../outside.txt", Buffer.from("x")))).toThrow(/unsafe archive path/i);
  });

  it("rejects declared uncompressed sizes above the configured limit", () => {
    const zip = zipFixture("large.txt", Buffer.from("0123456789"));
    expect(() => readZip(zip, { maxFiles: 5, maxUncompressedBytes: 5 })).toThrow(/too large|limit/i);
  });

  it("rejects an invalid central-directory offset", () => {
    const zip = zipFixture("ok.txt", Buffer.from("ok"));
    const eocd = zip.length - 22;
    zip.writeUInt32LE(0xfffffff0, eocd + 16);
    expect(() => readZip(zip)).toThrow(/invalid zip/i);
  });

  it("rejects decompression output exceeding the declared size", () => {
    const zip = zipFixture("compressed.txt", Buffer.from("A".repeat(2000)), 8);
    const eocd = zip.length - 22;
    const centralOffset = zip.readUInt32LE(eocd + 16);
    zip.writeUInt32LE(10, centralOffset + 24);
    expect(() => readZip(zip, { maxFiles: 5, maxUncompressedBytes: 5000 })).toThrow(/invalid or oversized|size mismatch/i);
  });
});
