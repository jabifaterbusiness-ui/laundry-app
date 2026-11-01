import type { Role } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { hasPermission } from "../permissions/permissions.service.js";
import type { GlobalSearchQuery } from "./search.validation.js";

export interface GlobalSearchResult {
  type: "CUSTOMER" | "ORDER" | "INVOICE";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export async function globalSearch(
  userId: string,
  role: Role,
  businessId: string,
  branchId: string,
  input: GlobalSearchQuery,
): Promise<GlobalSearchResult[]> {
  const query = input.q.trim();

  if (!query) {
    return [];
  }

  const [canViewCustomers, canViewOrders, canViewInvoices] =
    await Promise.all([
      hasPermission(
        userId,
        businessId,
        role,
        "customers.view",
      ),
      hasPermission(
        userId,
        businessId,
        role,
        "orders.view",
      ),
      hasPermission(
        userId,
        businessId,
        role,
        "invoices.view",
      ),
    ]);

  const [customers, orders, invoices] = await Promise.all([
    canViewCustomers
      ? prisma.customer.findMany({
          where: {
            businessId,
            OR: [
              {
                name: {
                  contains: query,
                  mode: "insensitive",
                },
              },
              {
                phone: {
                  contains: query,
                },
              },
              {
                email: {
                  contains: query,
                  mode: "insensitive",
                },
              },
            ],
          },
          orderBy: {
            name: "asc",
          },
          take: input.limit,
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            ...(canViewOrders
              ? {
                  orders: {
                    where: { branchId },
                    orderBy: { createdAt: "desc" as const },
                    take: 1,
                    select: { id: true, orderNumber: true, status: true },
                  },
                }
              : {}),
          },
        })
      : Promise.resolve([]),

    canViewOrders
      ? prisma.order.findMany({
          where: {
            businessId,
            branchId,
            OR: [
              {
                orderNumber: {
                  contains: query,
                },
              },
              {
                customer: {
                  name: {
                    contains: query,
                    mode: "insensitive",
                  },
                },
              },
            ],
          },
          orderBy: {
            createdAt: "desc",
          },
          take: input.limit,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            customer: {
              select: {
                name: true,
              },
            },
          },
        })
      : Promise.resolve([]),

    canViewInvoices
      ? prisma.invoice.findMany({
          where: {
            businessId,
            branchId,
            OR: [
              {
                invoiceNumber: {
                  contains: query,
                },
              },
              {
                customerName: {
                  contains: query,
                  mode: "insensitive",
                },
              },
            ],
          },
          orderBy: {
            createdAt: "desc",
          },
          take: input.limit,
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            customerName: true,
          },
        })
      : Promise.resolve([]),
  ]);

  return [
    ...customers.map((customer) => ({
      type: "CUSTOMER" as const,
      id: customer.id,
      title: customer.name,
      subtitle: [customer.phone, customer.email].filter(Boolean).join(" · "),
      href: customer.orders?.[0]?.id
        ? `/orders?orderId=${encodeURIComponent(customer.orders[0].id)}`
        : `/orders?customerId=${encodeURIComponent(customer.id)}`,
    })),

    ...orders.map((order) => ({
      type: "ORDER" as const,
      id: order.id,
      title: `Order #${order.orderNumber}`,
      subtitle: `${order.customer.name} · ${order.status}`,
      href: `/orders?orderId=${encodeURIComponent(order.id)}`,
    })),

    ...invoices.map((invoice) => ({
      type: "INVOICE" as const,
      id: invoice.id,
      title: `Invoice #${invoice.invoiceNumber}`,
      subtitle: `${invoice.customerName} · ${invoice.status}`,
      href: `/invoices`,
    })),
  ].slice(0, input.limit);
}
