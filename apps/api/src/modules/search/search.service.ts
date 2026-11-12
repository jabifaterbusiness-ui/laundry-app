import type { Role } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { hasPermission } from "../permissions/permissions.service.js";
import { getBranchResourceScope } from "../branches/branch-resource-scope.service.js";
import type { GlobalSearchQuery } from "./search.validation.js";

export interface GlobalSearchResult {
  type: "CUSTOMER" | "ORDER" | "INVOICE" | "PAYMENT";
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

  const customerScope = await getBranchResourceScope({
    businessId,
    branchId,
    userId,
    resourceType: "CUSTOMERS",
  });

  const [canViewCustomers, canViewOrders, canViewInvoices, canViewPayments] =
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
      hasPermission(
        userId,
        businessId,
        role,
        "payments.view",
      ),
    ]);

  const [customers, orders, payments, invoices] = await Promise.all([
    canViewCustomers
      ? prisma.customer.findMany({
          where: {
            businessId,
            AND: [
              {
                OR: [
                  { ownerBranchId: { in: customerScope.ownerBranchIds } },
                  { id: { in: customerScope.resourceIds } },
                ],
              },
            ],
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { phone: { contains: query } },
              { email: { contains: query, mode: "insensitive" } },
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
          },
        })
      : Promise.resolve([]),

    canViewOrders
      ? prisma.order.findMany({
          where: {
            businessId,
            branchId,
            AND: [
              {
                customer: {
                  is: {
                    businessId,
                    OR: [
                      { ownerBranchId: { in: customerScope.ownerBranchIds } },
                      { id: { in: customerScope.resourceIds } },
                    ],
                  },
                },
              },
              {
                OR: [
                  { orderNumber: { contains: query } },
                  { customer: { name: { contains: query, mode: "insensitive" } } },
                  { customer: { phone: { contains: query } } },
                  { customer: { email: { contains: query, mode: "insensitive" } } },
                ],
              },
            ],
          },
          orderBy: {
            createdAt: "desc",
          },
          take: input.limit,
          select: {
            id: true,
            customerId: true,
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

    canViewPayments
      ? prisma.payment.findMany({
          where: {
            businessId,
            branchId,
            invoice: {
              is: {
                businessId,
                branchId,
                order: {
                  is: {
                    businessId,
                    branchId,
                    customer: {
                      is: {
                        businessId,
                        OR: [
                          { ownerBranchId: { in: customerScope.ownerBranchIds } },
                          { id: { in: customerScope.resourceIds } },
                        ],
                      },
                    },
                  },
                },
              },
            },
            OR: [
              { reference: { contains: query, mode: "insensitive" } },
              { note: { contains: query, mode: "insensitive" } },
              { invoice: { is: { invoiceNumber: { contains: query } } } },
              { invoice: { is: { customerName: { contains: query, mode: "insensitive" } } } },
              { invoice: { is: { order: { is: { orderNumber: { contains: query } } } } } },
              { invoice: { is: { order: { is: { customer: { is: { name: { contains: query, mode: "insensitive" } } } } } } },
              { invoice: { is: { order: { is: { customer: { is: { phone: { contains: query } } } } } } },
              { invoice: { is: { order: { is: { customer: { is: { email: { contains: query, mode: "insensitive" } } } } } } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: input.limit,
          select: {
            id: true,
            amount: true,
            method: true,
            status: true,
            type: true,
            reference: true,
            invoice: {
              select: {
                invoiceNumber: true,
                customerName: true,
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
            order: {
              is: {
                businessId,
                branchId,
                customer: {
                  is: {
                    businessId,
                    OR: [
                      { ownerBranchId: { in: customerScope.ownerBranchIds } },
                      { id: { in: customerScope.resourceIds } },
                    ],
                  },
                },
              },
            },
            OR: [
              { invoiceNumber: { contains: query } },
              { customerName: { contains: query, mode: "insensitive" } },
              { order: { is: { orderNumber: { contains: query } } } },
              { order: { is: { customer: { is: { name: { contains: query, mode: "insensitive" } } } } } },
              { order: { is: { customer: { is: { phone: { contains: query } } } } } },
              { order: { is: { customer: { is: { email: { contains: query, mode: "insensitive" } } } } } },
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

  // Keep result types balanced so a long list of customer matches cannot
  // push matching orders, invoices or payments out of the dropdown.
  const groupedResults: GlobalSearchResult[][] = [
    customers.map((customer) => ({
      type: "CUSTOMER",
      id: customer.id,
      title: customer.name,
      subtitle: [customer.phone, customer.email].filter(Boolean).join(" · "),
      href: `/orders?customerId=${encodeURIComponent(customer.id)}&openAccount=1`,
    })),
    orders.map((order) => ({
      type: "ORDER",
      id: order.id,
      title: `Order #${order.orderNumber}`,
      subtitle: `${order.customer.name} · ${order.status}`,
      href: `/orders?orderId=${encodeURIComponent(order.id)}`,
    })),
    invoices.map((invoice) => ({
      type: "INVOICE",
      id: invoice.id,
      title: `Invoice #${invoice.invoiceNumber}`,
      subtitle: `${invoice.customerName} · ${invoice.status}`,
      href: `/invoices?invoiceId=${encodeURIComponent(invoice.id)}`,
    })),
    payments.map((payment) => ({
      type: "PAYMENT",
      id: payment.id,
      title: payment.reference
        ? `${payment.type === "REFUND" ? "Refund" : "Payment"} · ${payment.reference}`
        : `${payment.type === "REFUND" ? "Refund" : "Payment"} · ${payment.method} · ₦${payment.amount.toLocaleString("en-NG")}`,
      subtitle: `${payment.invoice.customerName} · Invoice #${payment.invoice.invoiceNumber} · ${payment.status}`,
      href: `/payments?paymentId=${encodeURIComponent(payment.id)}`,
    })),
  ];
  const results: GlobalSearchResult[] = [];
  for (let index = 0; results.length < input.limit; index += 1) {
    let added = false;
    for (const group of groupedResults) {
      const result = group[index];
      if (result && results.length < input.limit) {
        results.push(result);
        added = true;
      }
    }
    if (!added) break;
  }
  return results;
}
