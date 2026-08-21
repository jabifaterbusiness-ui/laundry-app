import { createHash } from "node:crypto";
import path from "node:path";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { readZip } from "./archive.js";
import { parseDbf, type DbfTable } from "./formats/dbf.js";
import { parseCsv, parseJson, type TabularTable } from "./formats/tabular.js";
import { readMigrationSource, storeMigrationSource } from "./storage.js";
import type { MigrationSourceType, Prisma } from "@prisma/client";
import { normalizePhone } from "../customers/customers.validation.js";
import * as XLSX from "xlsx";

interface DetectedTable {
  fileName: string;
  format: string;
  rows: Record<string, unknown>[];
  headers: string[];
  tableName?: string;
  sizeBytes: number;
  sha256: string;
}

export interface CustomerFieldMapping {
  name?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  address?: string | undefined;
  notes?: string | undefined;
}

interface CustomerCandidate {
  sourceRow: number;
  sourceFile: string;
  legacyId?: string | undefined;
  name: string;
  phone: string;
  email?: string | undefined;
  address?: string | undefined;
  notes?: string | undefined;
}

export interface MigrationSummary {
  files: number;
  tables: number;
  records: number;
  supported: { customers: number };
  unsupported: Array<{ file: string; table: string; rows: number; reason: string }>;
  warnings: string[];
  errors: string[];
  customerPreview: CustomerCandidate[];
  customerHeaders: string[];
  customerMapping: CustomerFieldMapping;
}

const CUSTOMER_FILE_NAMES = new Set(["CUSTOMER.DBF", "CUSTOMERS.CSV", "CUSTOMER.CSV", "CUSTOMERS.JSON", "CUSTOMER.JSON"]);

function sourceTypeForName(name: string): MigrationSourceType {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".zip") return "DBF";
  if (ext === ".dbf") return "DBF";
  if (ext === ".csv") return "CSV";
  if (ext === ".json") return "JSON";
  if (ext === ".xlsx" || ext === ".xls") return "XLSX";
  return "UNKNOWN";
}

function clean(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function firstValue(row: Record<string, unknown>, names: string[]): string {
  for (const name of names) {
    const direct = row[name];
    if (direct !== undefined && direct !== null && clean(direct)) return clean(direct);
    const key = Object.keys(row).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    if (key && clean(row[key])) return clean(row[key]);
  }
  return "";
}

function guessMapping(headers: string[]): CustomerFieldMapping {
  const lower = headers.map((header) => ({ header, lower: header.toLowerCase() }));
  const find = (names: string[]) => lower.find((item) => names.includes(item.lower))?.header;
  return {
    name: find(["name", "customername", "customer_name", "fullname", "full_name", "company"]),
    firstName: find(["fname", "firstname", "first_name", "first", "givenname"]),
    lastName: find(["lname", "lastname", "last_name", "last", "surname"]),
    phone: find(["phone", "phonenumber", "phone_number", "mobile", "mobilephone", "cphone", "hphone", "wphone"]),
    email: find(["email", "emailaddress", "email_address"]),
    address: find(["address", "address1", "street"]),
    notes: find(["note", "notes", "customernote"]),
  };
}

function customerCandidate(row: Record<string, unknown>, sourceFile: string, sourceRow: number, mapping?: CustomerFieldMapping): CustomerCandidate | null {
  const firstName = mapping?.firstName ? clean(row[mapping.firstName]) : firstValue(row, ["FNAME", "FIRSTNAME", "FIRST_NAME", "FIRST", "GIVENNAME"]);
  const lastName = mapping?.lastName ? clean(row[mapping.lastName]) : firstValue(row, ["LNAME", "LASTNAME", "LAST_NAME", "LAST", "SURNAME"]);
  const company = mapping?.name ? clean(row[mapping.name]) : firstValue(row, ["COMPANY", "COMPANYNAME", "BUSINESS", "CUSTOMERNAME", "NAME"]);
  const name = [firstName, lastName].filter(Boolean).join(" ") || company;
  const phone = mapping?.phone ? clean(row[mapping.phone]) : firstValue(row, ["PHONE", "PHONENUMBER", "PHONE_NUMBER", "MOBILE", "MOBILEPHONE", "CPHONE", "HPHONE", "WPHONE"]);
  if (!name || !phone) return null;
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return null;
  const addressParts = [mapping?.address ? clean(row[mapping.address]) : firstValue(row, ["ADDRESS", "ADDRESS1", "STREET"]), firstValue(row, ["ADDRESS2", "ADDRESS_2"]), firstValue(row, ["CITY"]), firstValue(row, ["PROV", "STATE", "REGION"]), firstValue(row, ["PCODE", "POSTCODE", "ZIP", "ZIPCODE"])].filter(Boolean);
  const legacyId = firstValue(row, ["IDCUSTOMER", "CUSTOMERID", "CUSTOMER_ID", "ID", "CUSTCODE"]);
  const email = mapping?.email ? clean(row[mapping.email]) : firstValue(row, ["EMAIL", "EMAILADDRESS", "EMAIL_ADDRESS"]);
  const notes = mapping?.notes ? clean(row[mapping.notes]) : firstValue(row, ["NOTE", "NOTES", "CUSTOMERNOTE"]);
  return { sourceRow, sourceFile, legacyId: legacyId || undefined, name, phone: normalizedPhone, email: email || undefined, address: addressParts.join(", ") || undefined, notes: notes || undefined };
}

function parseXlsx(name: string, buffer: Buffer): DetectedTable[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

  return workbook.SheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
    });

    const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];

    return [{
      fileName: `${name}#${sheetName}`,
      format: "xlsx",
      rows,
      headers,
      tableName: sheetName,
      sizeBytes: buffer.length,
      sha256: createHash("sha256").update(buffer).digest("hex"),
    }];
  });
}

function parseFile(name: string, buffer: Buffer, memoBuffer?: Buffer): DetectedTable[] {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".dbf") {
    const table: DbfTable = parseDbf(name, buffer, 250_000, memoBuffer);
    return [{ fileName: name, format: "dbf", rows: table.rows, headers: table.fields.map((field) => field.name), tableName: path.basename(name, ext).toUpperCase(), sizeBytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") }];
  }
  if (ext === ".csv") {
    const table: TabularTable = parseCsv(name, buffer);
    return [{ fileName: name, format: "csv", rows: table.rows, headers: table.headers, tableName: path.basename(name, ext).toUpperCase(), sizeBytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") }];
  }
  if (ext === ".json") {
    const table = parseJson(name, buffer);
    return [{ fileName: name, format: "json", rows: table.rows, headers: table.headers, tableName: path.basename(name, ext).toUpperCase(), sizeBytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") }];
  }
  if (ext === ".xlsx" || ext === ".xls") return parseXlsx(name, buffer);
  return [];
}

function parseSource(sourceName: string, buffer: Buffer): DetectedTable[] {
  if (path.extname(sourceName).toLowerCase() !== ".zip") return parseFile(sourceName, buffer);
  const entries = readZip(buffer);
  const tables: DetectedTable[] = [];
  const byPath = new Map(entries.map((entry) => [entry.path.toLowerCase(), entry.data]));
  for (const entry of entries) {
    const ext = path.extname(entry.path).toLowerCase();
    if (![".dbf", ".csv", ".json", ".xlsx", ".xls"].includes(ext)) continue;
    const memoPath = ext === ".dbf" ? `${entry.path.slice(0, -4)}.fpt`.toLowerCase() : undefined;
    tables.push(...parseFile(entry.path, entry.data, memoPath ? byPath.get(memoPath) : undefined));
  }
  return tables;
}

function sourceFileBaseName(fileName: string): string {
  return path.basename(fileName).toUpperCase();
}

function isCustomerTable(table: DetectedTable): boolean {
  const base = sourceFileBaseName(table.fileName);
  if (CUSTOMER_FILE_NAMES.has(base)) return true;
  const headers = new Set(table.headers.map((h) => h.toLowerCase()));
  const hasName = ["name", "customername", "fname", "firstname"].some((h) => headers.has(h));
  const hasPhone = ["phone", "phonenumber", "mobile", "cphone", "hphone", "wphone"].some((h) => headers.has(h));
  return hasName && hasPhone;
}

function analyzeTables(tables: DetectedTable[], customerMapping?: CustomerFieldMapping): { summary: MigrationSummary; candidates: CustomerCandidate[] } {
  const summary: MigrationSummary = { files: new Set(tables.map((table) => table.fileName.split("#", 1)[0])).size, tables: tables.length, records: 0, supported: { customers: 0 }, unsupported: [], warnings: [], errors: [], customerPreview: [], customerHeaders: [], customerMapping: customerMapping ?? {} };
  const candidates: CustomerCandidate[] = [];
  for (const table of tables) {
    summary.records += table.rows.length;
    if (!isCustomerTable(table)) {
      summary.unsupported.push({ file: table.fileName, table: table.tableName ?? "unknown", rows: table.rows.length, reason: "No importer is currently registered for this entity/table. The records are preserved in the source backup and will not be silently discarded." });
      continue;
    }
    let invalid = 0;
    if (summary.customerHeaders.length === 0) summary.customerHeaders = table.headers;
    table.rows.forEach((row, index) => {
      const candidate = customerCandidate(row, table.fileName, index + 1, customerMapping);
      if (!candidate) invalid += 1;
      else candidates.push(candidate);
    });
    if (invalid > 0) summary.warnings.push(`${table.fileName}: ${invalid} customer rows have no usable name or phone and will be skipped.`);
  }
  summary.supported.customers = candidates.length;
  summary.customerPreview = candidates.slice(0, 20);
  return { summary, candidates };
}

export async function analyzeMigrationSource(input: { businessId: string; userId: string; sourceName: string; buffer: Buffer }) {
  if (input.buffer.length === 0) throw new AppError("Uploaded backup is empty", 422);
  const sourceType = sourceTypeForName(input.sourceName);
  const job = await prisma.migrationJob.create({ data: { businessId: input.businessId, createdById: input.userId, sourceType, sourceName: input.sourceName, status: "ANALYZING", sourcePath: "pending", sourceSha256: createHash("sha256").update(input.buffer).digest("hex") } });
  try {
    const stored = await storeMigrationSource(job.id, input.buffer);
    const tables = parseSource(input.sourceName, input.buffer);
    const customerTable = tables.find(isCustomerTable);
    const customerMapping = customerTable ? guessMapping(customerTable.headers) : {};
    const { summary, candidates } = analyzeTables(tables, customerMapping);
    await prisma.migrationFile.createMany({
      data: tables.map((table) => ({ jobId: job.id, relativePath: table.fileName, format: table.format, tableName: table.tableName ?? null, sizeBytes: table.sizeBytes, sha256: table.sha256, rowCount: table.rows.length, headers: table.headers })),
    });
    if (summary.unsupported.length > 0) {
      await prisma.migrationIssue.createMany({ data: summary.unsupported.map((item) => ({ jobId: job.id, severity: "WARNING", code: "UNSUPPORTED_TABLE", message: item.reason, sourceFile: item.file, details: { table: item.table, rows: item.rows } })) });
    }
    const invalidCount = summary.warnings.length;
    if (invalidCount) await prisma.migrationIssue.create({ data: { jobId: job.id, severity: "WARNING", code: "INVALID_CUSTOMER_ROWS", message: summary.warnings.join(" ") } });
    const updated = await prisma.migrationJob.update({
  where: { id: job.id },
  data: {
    status: "READY",
    sourcePath: stored.path,
    summary: JSON.parse(JSON.stringify({ ...summary, customerPreview: candidates })),
  },
});
    return { job: updated, summary };
  } catch (error) {
    await prisma.migrationJob.update({ where: { id: job.id }, data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : "Migration analysis failed" } });
    throw error;
  }
}

export async function getMigrationJob(businessId: string, jobId: string) {
  const job = await prisma.migrationJob.findFirst({ where: { id: jobId, businessId }, include: { files: true, issues: true } });
  if (!job) throw new AppError("Migration job not found", 404);
  return job;
}

async function loadCandidates(job: { sourceName: string; sourcePath: string }, mapping?: CustomerFieldMapping): Promise<CustomerCandidate[]> {
  const buffer = await readMigrationSource(job.sourcePath);
  const tables = parseSource(job.sourceName, buffer);
  const { candidates } = analyzeTables(tables, mapping);
  return candidates;
}

export async function importMigrationJob(input: { businessId: string; userId: string; jobId: string; duplicatePolicy: "skip" | "merge" | "create"; mapping?: CustomerFieldMapping }) {
  const job = await prisma.migrationJob.findFirst({ where: { id: input.jobId, businessId: input.businessId } });
  if (!job) throw new AppError("Migration job not found", 404);
  if (job.status !== "READY") throw new AppError(`Migration job is ${job.status.toLowerCase()} and cannot be imported`, 409);

  await prisma.migrationJob.update({ where: { id: job.id }, data: { status: "IMPORTING" } });
  try {
    const candidates = await loadCandidates(job, input.mapping);
    let created = 0;
    let skipped = 0;
    let merged = 0;
    let invalid = 0;

    const chunkSize = 500;
    for (let offset = 0; offset < candidates.length; offset += chunkSize) {
      const chunk = candidates.slice(offset, offset + chunkSize);
      const phones = [...new Set(chunk.map((candidate) => candidate.phone))];
      const existing = await prisma.customer.findMany({ where: { businessId: input.businessId, phone: { in: phones } } });
      const existingByPhone = new Map(existing.map((customer) => [customer.phone, customer]));
      const toCreate = [] as Prisma.CustomerCreateManyInput[];

      for (const candidate of chunk) {
        if (!candidate.name || !candidate.phone) { invalid += 1; continue; }
        const current = existingByPhone.get(candidate.phone);
        if (current) {
          if (input.duplicatePolicy === "skip") { skipped += 1; continue; }
          if (input.duplicatePolicy === "create") {
            toCreate.push({ businessId: input.businessId, name: candidate.name, phone: candidate.phone, email: candidate.email ?? null, address: candidate.address ?? null, notes: candidate.notes ?? null });
            continue;
          }
          const data: Prisma.CustomerUpdateInput = {};
          if (!current.email && candidate.email) data.email = candidate.email;
          if (!current.address && candidate.address) data.address = candidate.address;
          if (!current.notes && candidate.notes) data.notes = candidate.notes;
          if (Object.keys(data).length) await prisma.customer.update({ where: { id: current.id }, data });
          merged += 1;
          continue;
        }
        toCreate.push({ businessId: input.businessId, name: candidate.name, phone: candidate.phone, email: candidate.email ?? null, address: candidate.address ?? null, notes: candidate.notes ?? null });
      }

      if (toCreate.length) {
        const result = await prisma.customer.createMany({ data: toCreate });
        created += result.count;
      }
    }

    const summary = { imported: { customersCreated: created, customersMerged: merged, customersSkipped: skipped, invalidRows: invalid }, duplicatePolicy: input.duplicatePolicy };
    const existingSummary = job.summary && typeof job.summary === "object" ? (job.summary as Record<string, unknown>) : {};
    await prisma.migrationJob.update({ where: { id: job.id }, data: { status: "COMPLETED", completedAt: new Date(), summary: { ...existingSummary, import: summary } } });
    return summary;
  } catch (error) {
    await prisma.migrationJob.update({ where: { id: job.id }, data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : "Migration import failed" } });
    throw error;
  }
}
