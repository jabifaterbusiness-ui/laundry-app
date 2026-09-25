export type CustomerLifecycleStatus =
  | "ACTIVE"
  | "DORMANT"
  | "BLOCKED"
  | "BLACKLISTED";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  lifecycleStatus: CustomerLifecycleStatus;
  statusReason: string | null;
  statusChangedAt: string | null;
  statusChangedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// Returned (409) by POST /customers when a likely-duplicate customer is
// found and the caller did not pass confirmDuplicate: true. See
// docs/CUSTOMERS.md section E for the duplicate-handling decision.
export interface PossibleDuplicateError {
  message: string;
  duplicates: Pick<Customer, "id" | "name" | "phone">[];
}
