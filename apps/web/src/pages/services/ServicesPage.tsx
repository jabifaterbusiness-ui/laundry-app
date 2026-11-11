import { useEffect, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import {
  createService,
  createPriceAdjustment,
  createTaxRule,
  deletePriceAdjustment,
  setPriceAdjustmentActive,
  deleteTaxRule,
  listPricingRules,
  listServices,
  setServiceActive,
  updateService,
  type CreateServiceInput,
  type Service,
} from "../../lib/services-api.js";
import { useAuthStore } from "../../state/auth-store.js";
import { hasPermission } from "../../lib/permissions.js";
import { listBranches } from "../../lib/users-api.js";
import { listCustomers } from "../../lib/customers-api.js";
import { listCustomerGroups } from "../../lib/communications-api.js";
import { TableExportActions } from "../../components/exports/TableExportActions.js";

const EMPTY_FORM: CreateServiceInput = {
  name: "",
  pieces: 1,
  unitPrice: 0,
};

export function ServicesPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const user = useAuthStore((s) => s.user);
  const setActiveBranch = useAuthStore((s) => s.setActiveBranch);
  const canManageBranchSharing = hasPermission(user, "branches.update");
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [search, setSearch] = useState("");
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editorBranchId, setEditorBranchId] = useState(activeBranchId ?? "");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CreateServiceInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [adjustmentName, setAdjustmentName] = useState("");
  const [adjustmentPercentage, setAdjustmentPercentage] = useState(-10);
  const [adjustmentTargetScope, setAdjustmentTargetScope] = useState<"MANUAL" | "CUSTOMER" | "GROUP" | "ALL_CUSTOMERS">("MANUAL");
  const [adjustmentCustomerSearch, setAdjustmentCustomerSearch] = useState("");
  const [adjustmentCustomerId, setAdjustmentCustomerId] = useState("");
  const [adjustmentGroupId, setAdjustmentGroupId] = useState("");
  const [adjustmentStartsAt, setAdjustmentStartsAt] = useState("");
  const [adjustmentEndsAt, setAdjustmentEndsAt] = useState("");
  const [adjustmentAllowStacking, setAdjustmentAllowStacking] = useState(false);
  const [adjustmentExcludedServices, setAdjustmentExcludedServices] = useState<string[]>([]);
  const [adjustmentPage, setAdjustmentPage] = useState(1);
  const [taxPage, setTaxPage] = useState(1);
  const [taxName, setTaxName] = useState("");
  const [taxValue, setTaxValue] = useState(7.5);
  const [taxKind, setTaxKind] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const [taxTreatment, setTaxTreatment] = useState<"ADDITIVE" | "WITHHOLDING">("ADDITIVE");
  const [taxEnabledByDefault, setTaxEnabledByDefault] = useState(false);
  const [taxAllowCombination, setTaxAllowCombination] = useState(true);

  useEffect(() => {
    setAdjustmentPage(1);
    setTaxPage(1);
  }, [activeBranchId]);

  const pricingRulesQuery = useQuery({
    queryKey: ["pricing-rules", "management", activeBranchId, adjustmentPage, taxPage],
    queryFn: () => listPricingRules(
      { accessToken },
      undefined,
      "management",
      { adjustmentPage, taxPage, pageSize: 50 },
    ),
    enabled: Boolean(accessToken && activeBranchId),
  });
  const discountCustomersQuery = useQuery({
    queryKey: ["discount-target-customers", activeBranchId, adjustmentCustomerSearch],
    queryFn: () => listCustomers({
      page: 1,
      pageSize: 25,
      search: adjustmentCustomerSearch || undefined,
      status: "active",
    }, { accessToken }),
    enabled: Boolean(accessToken && activeBranchId && adjustmentTargetScope === "CUSTOMER"),
  });
  const discountGroupsQuery = useQuery({
    queryKey: ["discount-target-groups"],
    queryFn: () => listCustomerGroups({ accessToken }),
    enabled: Boolean(accessToken && adjustmentTargetScope === "GROUP"),
  });
  const pricingRulesMutation = useMutation({
    mutationFn: async (kind: "adjustment" | "tax") => {
      if (kind === "adjustment") {
        if (adjustmentTargetScope !== "MANUAL" && adjustmentPercentage >= 0) {
          throw new Error("Automatic discounts must use a negative percentage.");
        }
        if (adjustmentTargetScope === "CUSTOMER" && !adjustmentCustomerId) {
          throw new Error("Choose the customer who should receive this discount.");
        }
        if (adjustmentTargetScope === "GROUP" && !adjustmentGroupId) {
          throw new Error("Choose the customer group for this discount.");
        }
        if (adjustmentTargetScope === "ALL_CUSTOMERS" && (!adjustmentStartsAt || !adjustmentEndsAt)) {
          throw new Error("Promotions for all customers require a start and end date.");
        }
        return createPriceAdjustment({
          name: adjustmentName.trim(),
          percentage: adjustmentPercentage,
          targetScope: adjustmentTargetScope,
          ...(adjustmentTargetScope === "CUSTOMER" ? { customerId: adjustmentCustomerId } : {}),
          ...(adjustmentTargetScope === "GROUP" ? { groupId: adjustmentGroupId } : {}),
          ...(adjustmentStartsAt ? { startsAt: new Date(adjustmentStartsAt).toISOString() } : {}),
          ...(adjustmentEndsAt ? { endsAt: new Date(adjustmentEndsAt).toISOString() } : {}),
          allowStacking: adjustmentAllowStacking,
          excludedServiceIds: adjustmentExcludedServices,
        }, { accessToken });
      }
      return createTaxRule({
        name: taxName.trim(), value: taxValue, kind: taxKind, treatment: taxTreatment,
        enabledByDefault: taxEnabledByDefault, allowWithOtherTaxes: taxAllowCombination,
      }, { accessToken });
    },
    onSuccess: () => {
      setAdjustmentName(""); setTaxName("");
      setAdjustmentTargetScope("MANUAL");
      setAdjustmentCustomerSearch(""); setAdjustmentCustomerId(""); setAdjustmentGroupId("");
      setAdjustmentStartsAt(""); setAdjustmentEndsAt("");
      setAdjustmentAllowStacking(false); setAdjustmentExcludedServices([]);
      setAdjustmentPage(1); setTaxPage(1);
      queryClient.invalidateQueries({ queryKey: ["pricing-rules"] });
    },
  });
  const adjustmentStatusMutation = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      setPriceAdjustmentActive(input.id, input.isActive, { accessToken }),
    onSuccess: () => {
      setAdjustmentPage(1);
      setTaxPage(1);
      queryClient.invalidateQueries({ queryKey: ["pricing-rules"] });
    },
  });
  const deletePricingRuleMutation = useMutation({
    mutationFn: async (input: { id: string; kind: "adjustment" | "tax" }) =>
      input.kind === "adjustment"
        ? deletePriceAdjustment(input.id, { accessToken })
        : deleteTaxRule(input.id, { accessToken }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pricing-rules"] }),
  });

  const branchesQuery = useQuery({
    queryKey: ["branches", "service-owner-options"],
    queryFn: () => listBranches(accessToken!),
    enabled: Boolean(accessToken && canManageBranchSharing),
  });

  const servicesQuery = useQuery({
    queryKey: ["services", activeBranchId, { status, search }],
    queryFn: () =>
      listServices(
        {
          status,
          search: search || undefined,
        },
        { accessToken },
      ),
  });

  const saveMutation = useMutation({
    mutationFn: async (input: CreateServiceInput) => {
      if (editingService) {
        return updateService(editingService.id, input, { accessToken });
      }

      return createService(input, { accessToken, branchId: editorBranchId });
    },
    onSuccess: () => {
      if (!editingService && editorBranchId && editorBranchId !== activeBranchId) {
        setActiveBranch(editorBranchId);
      }
      queryClient.invalidateQueries({ queryKey: ["services"] });
      closeForm();
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Unable to save service. Please try again.",
      );
    },
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      setServiceActive(input.id, input.isActive, { accessToken }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
  });

  function closeForm() {
    setFormOpen(false);
    setEditingService(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function openCreate() {
    setEditingService(null);
    setEditorBranchId(activeBranchId ?? "");
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(service: Service) {
    setEditingService(service);
    setEditorBranchId(service.ownerBranchId ?? activeBranchId ?? "");
    setForm({
      name: service.name,
      pieces: service.pieces,
      unitPrice: service.unitPrice,
    });
    setFormError(null);
    setFormOpen(true);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!form.name.trim()) {
      setFormError("Service name is required.");
      return;
    }

    if (!Number.isInteger(form.pieces) || form.pieces < 1) {
      setFormError("PCS must be a positive whole number.");
      return;
    }

    if (!Number.isInteger(form.unitPrice) || form.unitPrice < 0) {
      setFormError("Unit price must be zero or greater.");
      return;
    }
    if (!editingService && !editorBranchId) {
      setFormError("Select the branch that will own this service.");
      return;
    }

    saveMutation.mutate({
      name: form.name.trim(),
      pieces: form.pieces,
      unitPrice: form.unitPrice,
    });
  }

  async function loadAllServicesForExport(): Promise<Service[]> {
    const result = await listServices({ status: "all" }, { accessToken }); return result.data;
  }
  const services = servicesQuery.data?.data ?? [];

  return (
    <main>
      <h1>Services & Price List</h1>

      <section aria-labelledby="pricing-rules-heading" style={{ margin: "1.5rem 0", padding: "1.25rem", border: "1px solid var(--border, #d9dce3)", borderRadius: "14px" }}>
        <h2 id="pricing-rules-heading">Discounts, surcharges & taxes</h2>
        <p>Set reusable price adjustments and tax rules. New invoices use enabled default taxes; older invoices keep their saved totals.</p>
        {pricingRulesQuery.isError && <p role="alert">Unable to load pricing rules.</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
          <div>
            <h3>Discounts & promotions</h3>
            <p>Configure manual price adjustments, automatic individual and group discounts, and scheduled promotions. Automatic rules apply only to new invoices.</p>
            <form onSubmit={(event) => { event.preventDefault(); pricingRulesMutation.mutate("adjustment"); }}>
              <label>Discount / adjustment name<input value={adjustmentName} onChange={(event) => setAdjustmentName(event.target.value)} required maxLength={120} /></label>
              <label>Rule applies to
                <select value={adjustmentTargetScope} onChange={(event) => {
                  setAdjustmentTargetScope(event.target.value as typeof adjustmentTargetScope);
                  setAdjustmentCustomerId(""); setAdjustmentGroupId("");
                }}>
                  <option value="MANUAL">Manual adjustment (selected by staff)</option>
                  <option value="CUSTOMER">Specific customer (automatic)</option>
                  <option value="GROUP">Customer group (automatic)</option>
                  <option value="ALL_CUSTOMERS">All customers promotion (scheduled)</option>
                </select>
              </label>
              {adjustmentTargetScope === "CUSTOMER" && (
                <>
                  <label>Find customer<input type="search" value={adjustmentCustomerSearch} onChange={(event) => setAdjustmentCustomerSearch(event.target.value)} placeholder="Search by customer name or phone" /></label>
                  <label>Customer
                    <select value={adjustmentCustomerId} onChange={(event) => setAdjustmentCustomerId(event.target.value)} required>
                      <option value="">Choose a customer</option>
                      {(discountCustomersQuery.data?.data ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>)}
                    </select>
                  </label>
                  {discountCustomersQuery.isLoading && <small>Searching customers…</small>}
                  {discountCustomersQuery.isError && <p role="alert">Unable to search customers. Check your customer-view permission and try again.</p>}
                  {discountCustomersQuery.isSuccess && discountCustomersQuery.data.data.length === 0 && <small>No active customers match this search.</small>}
                </>
              )}
              {adjustmentTargetScope === "GROUP" && (
                <>
                <label>Customer group
                  <select value={adjustmentGroupId} onChange={(event) => setAdjustmentGroupId(event.target.value)} required>
                    <option value="">Choose a group</option>
                    {(discountGroupsQuery.data?.data ?? []).map((group) => <option key={group.id} value={group.id}>{group.name} ({group._count.members} customers)</option>)}
                  </select>
                </label>
                {discountGroupsQuery.isError && <p role="alert">Unable to load customer groups. Check your customer-view permission and try again.</p>}
                {discountGroupsQuery.isSuccess && discountGroupsQuery.data.data.length === 0 && <small>Create a customer group in Customer Engagement before assigning a group discount.</small>}
                </>
              )}
              <label>Percentage ({adjustmentTargetScope === "MANUAL" ? "+ surcharge / − discount" : "automatic discount; enter a negative value"})
                <input type="number" min="-100" max={adjustmentTargetScope === "MANUAL" ? "1000" : "-0.01"} step="0.01" value={adjustmentPercentage} onChange={(event) => setAdjustmentPercentage(Number(event.target.value))} required />
              </label>
              {adjustmentTargetScope === "ALL_CUSTOMERS" && (
                <>
                  <label>Promotion starts<input type="datetime-local" value={adjustmentStartsAt} onChange={(event) => setAdjustmentStartsAt(event.target.value)} required /></label>
                  <label>Promotion ends<input type="datetime-local" value={adjustmentEndsAt} onChange={(event) => setAdjustmentEndsAt(event.target.value)} required /></label>
                </>
              )}
              {adjustmentTargetScope !== "MANUAL" && (
                <>
                  <label><input type="checkbox" checked={adjustmentAllowStacking} onChange={(event) => setAdjustmentAllowStacking(event.target.checked)} /> Allow this discount to combine with other discounts</label>
                  <fieldset style={{ border: "1px solid #d8dee8", borderRadius: 8, padding: 10 }}>
                    <legend>Exclude services (optional)</legend>
                    {(servicesQuery.data?.data ?? []).map((service) => (
                      <label key={service.id} style={{ display: "block" }}>
                        <input type="checkbox" checked={adjustmentExcludedServices.includes(service.id)} onChange={(event) => setAdjustmentExcludedServices((current) => event.target.checked ? [...current, service.id] : current.filter((id) => id !== service.id))} />
                        {service.name}
                      </label>
                    ))}
                  </fieldset>
                </>
              )}
              <button type="submit" disabled={!adjustmentName.trim() || pricingRulesMutation.isPending || (adjustmentTargetScope === "CUSTOMER" && !adjustmentCustomerId) || (adjustmentTargetScope === "GROUP" && !adjustmentGroupId) || (adjustmentTargetScope === "ALL_CUSTOMERS" && (!adjustmentStartsAt || !adjustmentEndsAt))}>Save discount / adjustment</button>
            </form>
            <ul>
              {(pricingRulesQuery.data?.adjustments ?? []).map((rule) => {
                const now = Date.now();
                const statusLabel = !rule.isActive ? "Paused"
                  : rule.startsAt && new Date(rule.startsAt).getTime() > now ? "Scheduled"
                    : rule.endsAt && new Date(rule.endsAt).getTime() < now ? "Expired"
                      : "Active";
                const targetLabel = rule.targetScope === "CUSTOMER" ? `Individual · ${rule.customer?.name ?? "Customer"}`
                  : rule.targetScope === "GROUP" ? `Group · ${rule.group?.name ?? "Customer group"}`
                    : rule.targetScope === "ALL_CUSTOMERS" ? "Promotion · All customers"
                      : "Manual adjustment";
                return <li key={rule.id}>
                  <strong>{rule.name}</strong> — {rule.percentage}% · {targetLabel} · {statusLabel}
                  {rule.startsAt && <small> · Starts {new Date(rule.startsAt).toLocaleString()}</small>}
                  {rule.endsAt && <small> · Ends {new Date(rule.endsAt).toLocaleString()}</small>}
                  {rule.allowStacking && <small> · Stackable</small>}
                  <button type="button" disabled={adjustmentStatusMutation.isPending} onClick={() => adjustmentStatusMutation.mutate({ id: rule.id, isActive: !rule.isActive })}>{rule.isActive ? "Pause" : "Resume"}</button>
                  <button type="button" disabled={deletePricingRuleMutation.isPending} onClick={() => deletePricingRuleMutation.mutate({ id: rule.id, kind: "adjustment" })}>Remove</button>
                </li>;
              })}
            </ul>
            {pricingRulesQuery.data?.pagination?.adjustments ? (
              <nav aria-label="Discount and adjustment pages">
                <span>
                  Page {pricingRulesQuery.data.pagination.adjustments.page} of {pricingRulesQuery.data.pagination.adjustments.totalPages}
                  {" · "}{pricingRulesQuery.data.pagination.adjustments.total} rules
                </span>
                <button
                  type="button"
                  disabled={pricingRulesQuery.data.pagination.adjustments.page <= 1}
                  onClick={() => setAdjustmentPage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={pricingRulesQuery.data.pagination.adjustments.page >= pricingRulesQuery.data.pagination.adjustments.totalPages}
                  onClick={() => setAdjustmentPage((page) => page + 1)}
                >
                  Next
                </button>
              </nav>
            ) : null}
          </div>
          <div>
            <h3>Tax rules</h3>
            <form onSubmit={(event) => { event.preventDefault(); pricingRulesMutation.mutate("tax"); }}>
              <label>Tax name<input value={taxName} onChange={(event) => setTaxName(event.target.value)} required maxLength={120} /></label>
              <label>Calculation type<select value={taxKind} onChange={(event) => setTaxKind(event.target.value as typeof taxKind)}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed amount (₦)</option></select></label>
              <label>{taxKind === "PERCENTAGE" ? "Rate (%)" : "Amount (₦)"}<input type="number" min="0" step="0.01" value={taxValue} onChange={(event) => setTaxValue(Number(event.target.value))} required /></label>
              <label>Tax treatment<select value={taxTreatment} onChange={(event) => setTaxTreatment(event.target.value as typeof taxTreatment)}><option value="ADDITIVE">Add to invoice</option><option value="WITHHOLDING">Deduct from invoice</option></select></label>
              <label><input type="checkbox" checked={taxEnabledByDefault} onChange={(event) => setTaxEnabledByDefault(event.target.checked)} /> Apply automatically to new invoices</label>
              <label><input type="checkbox" checked={taxAllowCombination} onChange={(event) => setTaxAllowCombination(event.target.checked)} /> May be combined with other taxes</label>
              <button type="submit" disabled={!taxName.trim() || pricingRulesMutation.isPending}>Add tax rule</button>
            </form>
            <ul>
              {(pricingRulesQuery.data?.taxes ?? []).map((rule) => <li key={rule.id}>
                {rule.name} — {rule.kind === "PERCENTAGE" ? `${rule.value}%` : `₦${rule.value.toLocaleString()}`} · {rule.treatment === "ADDITIVE" ? "Added" : "Withheld"}{rule.enabledByDefault ? " · Automatic" : ""}
                <button type="button" disabled={deletePricingRuleMutation.isPending} onClick={() => deletePricingRuleMutation.mutate({ id: rule.id, kind: "tax" })}>Remove</button>
              </li>)}
            </ul>
            {pricingRulesQuery.data?.pagination?.taxes ? (
              <nav aria-label="Tax rule pages">
                <span>
                  Page {pricingRulesQuery.data.pagination.taxes.page} of {pricingRulesQuery.data.pagination.taxes.totalPages}
                  {" · "}{pricingRulesQuery.data.pagination.taxes.total} rules
                </span>
                <button
                  type="button"
                  disabled={pricingRulesQuery.data.pagination.taxes.page <= 1}
                  onClick={() => setTaxPage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={pricingRulesQuery.data.pagination.taxes.page >= pricingRulesQuery.data.pagination.taxes.totalPages}
                  onClick={() => setTaxPage((page) => page + 1)}
                >
                  Next
                </button>
              </nav>
            ) : null}
          </div>
        </div>
        {pricingRulesMutation.isError && <p role="alert">Unable to save this pricing rule. Check its name and value, then try again.</p>}
      </section>
      <TableExportActions title="Complete services and price list" filename="laundryangel-price-list" loadRows={loadAllServicesForExport} columns={[
        { header: "Service / item", value: (row) => row.name }, { header: "Pieces", value: (row) => row.pieces },
        { header: "Unit price (NGN)", value: (row) => row.unitPrice }, { header: "Status", value: (row) => row.isActive ? "Active" : "Inactive" },
        { header: "Last updated", value: (row) => row.updatedAt },
      ]} />

      <div>
        <input
          type="search"
          placeholder="Search services"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as typeof status)
          }
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>

        <button type="button" onClick={openCreate}>
          New service
        </button>
      </div>

      {servicesQuery.isLoading && <p>Loading services...</p>}

      {servicesQuery.isError && (
        <p role="alert">
          {servicesQuery.error instanceof ApiError
            ? servicesQuery.error.message
            : "Failed to load services. Please try again."}
        </p>
      )}

      {servicesQuery.isSuccess && services.length === 0 && (
        <p>
          {search
            ? "No services match your search."
            : "No services found. Add your first service."}
        </p>
      )}

      {services.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>PCS</th>
              <th>Unit Price</th>
              <th>Owning Branch</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>

          <tbody>
            {services.map((service) => (
              <tr key={service.id}>
                <td>
                  <button
                    type="button"
                    onClick={() => openEdit(service)}
                  >
                    {service.name}
                  </button>
                </td>
                <td>{service.pieces}</td>
                <td>₦{service.unitPrice.toLocaleString()}</td>
                <td>{service.ownerBranch?.name ?? (service.ownerBranchId ? "Branch details unavailable" : "Business-wide legacy")}</td>
                <td>{service.isActive ? "Active" : "Inactive"}</td>
                <td>
                  {canManageBranchSharing && service.ownerBranchId && (user?.securityRole === "BUSINESS_OWNER" || service.ownerBranchId === activeBranchId) && (
                    <a
                      href={`/branches/sharing?ownerBranchId=${encodeURIComponent(service.ownerBranchId!)}&resourceType=SERVICES&resourceId=${encodeURIComponent(service.id)}`}
                      style={{ display: "inline-flex", alignItems: "center", padding: "0.45rem 0.7rem", borderRadius: 8, border: "1px solid var(--border, #cbd5e1)", textDecoration: "none" }}
                    >
                      Manage sharing
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={statusMutation.isPending}
                    onClick={() =>
                      statusMutation.mutate({
                        id: service.id,
                        isActive: !service.isActive,
                      })
                    }
                  >
                    {service.isActive ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {formOpen && (
        <section>
          <h2>{editingService ? "Edit service" : "New service"}</h2>

          <form onSubmit={handleSubmit}>
            {editingService ? (
              <div style={{ marginBottom: 12 }}>
                <p><strong>Owning branch:</strong> {editingService.ownerBranch?.name ?? (editingService.ownerBranchId ? "Branch details unavailable" : "Business-wide legacy")}</p>
                {canManageBranchSharing && editingService.ownerBranchId && (user?.securityRole === "BUSINESS_OWNER" || editingService.ownerBranchId === activeBranchId) && (
                  <a
                    href={`/branches/sharing?ownerBranchId=${encodeURIComponent(editingService.ownerBranchId!)}&resourceType=SERVICES&resourceId=${encodeURIComponent(editingService.id)}`}
                    style={{ display: "inline-flex", alignItems: "center", padding: "0.45rem 0.7rem", borderRadius: 8, border: "1px solid var(--border, #cbd5e1)", textDecoration: "none" }}
                  >
                    Manage branch sharing
                  </a>
                )}
              </div>
            ) : (
              <div>
                <label>
                  Owning branch
                  <select value={editorBranchId} onChange={(event) => setEditorBranchId(event.target.value)} disabled={branchesQuery.isLoading}>
                    {(branchesQuery.data ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                    {!(branchesQuery.data ?? []).length && activeBranchId && <option value={activeBranchId}>Current branch</option>}
                  </select>
                </label>
                <p><small>New services belong to this branch. Share access is configured separately.</small></p>
              </div>
            )}
            <div>
              <label>
                Item
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div>
              <label>
                PCS
                <input
                  type="number"
                  min="1"
                  value={form.pieces}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      pieces: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>

            <div>
              <label>
                Unit Price (₦)
                <input
                  type="number"
                  min="0"
                  value={form.unitPrice}
                  onFocus={(event) => {
                    if (event.currentTarget.value === "0") {
                      event.currentTarget.select();
                    }
                  }}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      unitPrice: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>

            {formError && <p role="alert">{formError}</p>}

            <button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending
                ? "Saving..."
                : editingService
                  ? "Save changes"
                  : "Create service"}
            </button>

            <button type="button" onClick={closeForm}>
              Cancel
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
