import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { normalizePhone } from "./customers.validation.js";

export { normalizePhone };

interface ListParams {
  businessId: string;
  page: number;
  pageSize: number;
  search?: string;
  status: "active" | "inactive" | "all";
}

export async function listCustomers(params: ListParams) {
  const { businessId, page, pageSize, search, status } = params;

  const where: Prisma.CustomerWhereInput = { businessId };

  if (status !== "all") {
    where.isActive = status === "active";
  }

  if (search) {
    const normalizedSearch = normalizePhone(search);
    const searchClauses: Prisma.CustomerWhereInput[] = [{ name: { contains: search, mode: "insensitive" } }];
    // Only add a phone clause if the search string contains at least one
    // digit - otherwise a pure-name search like "an" would also
    // (uselessly, since normalizedSearch would be "") match every phone.
    if (normalizedSearch.replace(/[^0-9]/g, "").length > 0) {
      searchClauses.push({ phone: { contains: normalizedSearch } });
    }
    where.OR = searchClauses;
  }

  const [data, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

/**
 * Tenant-scoped single-record lookup. Combines the id and businessId in
 * ONE query (rather than fetching by id and separately checking
 * ownership) so a cross-business lookup returns null exactly like a
 * nonexistent id does - the caller can't distinguish "doesn't exist"
 * from "exists but isn't yours" (LOCKED tenant-isolation decision).
 */
export async function getCustomerForBusiness(id: string, businessId: string) {
  return prisma.customer.findFirst({ where: { id, businessId } });
}

/**
 * Soft duplicate check (see docs/CUSTOMERS.md section E): looks for an
 * existing, active customer in the same business with the same
 * normalized phone number. Returns matches without blocking anything -
 * the caller decides what to do (customers.controller.ts turns this
 * into a 409 unless the request opted in with confirmDuplicate: true).
 *
 * `excludeId` is used by the update flow so a customer's own existing
 * phone number never counts as a "duplicate" of itself - only used for
 * PATCH, never for POST (create has no record to exclude).
 */
export async function findPossibleDuplicates(businessId: string, normalizedPhone: string, excludeId?: string) {
  return prisma.customer.findMany({
    where: {
      businessId,
      phone: normalizedPhone,
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, name: true, phone: true },
  });
}

export interface CreateCustomerData {
  businessId: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
}

export async function createCustomer(data: CreateCustomerData) {
  return prisma.customer.create({
    data: {
      businessId: data.businessId,
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
    },
  });
}

export interface UpdateCustomerData {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

/**
 * Tenant-scoped update: uses updateMany with {id, businessId} in the
 * where clause (not a bare update-by-id) so it's structurally impossible
 * to update a record that isn't in the caller's business, and re-reads
 * afterward for the response. Throws 404 if nothing matched - same
 * anti-leak reasoning as getCustomerForBusiness.
 */
export async function updateCustomer(id: string, businessId: string, data: UpdateCustomerData) {
  const patch: Prisma.CustomerUpdateManyMutationInput = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.phone !== undefined) patch.phone = data.phone;
  if (data.email !== undefined) patch.email = data.email;
  if (data.address !== undefined) patch.address = data.address;
  if (data.notes !== undefined) patch.notes = data.notes;

  const result = await prisma.customer.updateMany({ where: { id, businessId }, data: patch });

  if (result.count === 0) {
    throw new AppError("Customer not found", 404);
  }

  return getCustomerForBusiness(id, businessId);
}

export async function setCustomerActiveStatus(id: string, businessId: string, isActive: boolean) {
  const result = await prisma.customer.updateMany({ where: { id, businessId }, data: { isActive } });

  if (result.count === 0) {
    throw new AppError("Customer not found", 404);
  }

  return getCustomerForBusiness(id, businessId);
}
