import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import {
  createService,
  createPriceAdjustment,
  createTaxRule,
  deletePriceAdjustment,
  deleteTaxRule,
  listPricingRules,
  listServices,
  setServiceActive,
  updateService,
  type CreateServiceInput,
  type Service,
} from "../../lib/services-api.js";
import { useAuthStore } from "../../state/auth-store.js";
import { TableExportActions } from "../../components/exports/TableExportActions.js";

const EMPTY_FORM: CreateServiceInput = {
  name: "",
  pieces: 1,
  unitPrice: 0,
};

export function ServicesPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [search, setSearch] = useState("");
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CreateServiceInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [adjustmentName, setAdjustmentName] = useState("");
  const [adjustmentPercentage, setAdjustmentPercentage] = useState(-10);
  const [taxName, setTaxName] = useState("");
  const [taxValue, setTaxValue] = useState(7.5);
  const [taxKind, setTaxKind] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const [taxTreatment, setTaxTreatment] = useState<"ADDITIVE" | "WITHHOLDING">("ADDITIVE");
  const [taxEnabledByDefault, setTaxEnabledByDefault] = useState(false);
  const [taxAllowCombination, setTaxAllowCombination] = useState(true);

  const pricingRulesQuery = useQuery({
    queryKey: ["pricing-rules"],
    queryFn: () => listPricingRules({ accessToken }),
  });
  const pricingRulesMutation = useMutation({
    mutationFn: async (kind: "adjustment" | "tax") => {
      if (kind === "adjustment") {
        return createPriceAdjustment({ name: adjustmentName.trim(), percentage: adjustmentPercentage }, { accessToken });
      }
      return createTaxRule({
        name: taxName.trim(), value: taxValue, kind: taxKind, treatment: taxTreatment,
        enabledByDefault: taxEnabledByDefault, allowWithOtherTaxes: taxAllowCombination,
      }, { accessToken });
    },
    onSuccess: () => {
      setAdjustmentName(""); setTaxName("");
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

  const servicesQuery = useQuery({
    queryKey: ["services", { status, search }],
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

      return createService(input, { accessToken });
    },
    onSuccess: () => {
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
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(service: Service) {
    setEditingService(service);
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
            <h3>Price adjustments</h3>
            <form onSubmit={(event) => { event.preventDefault(); pricingRulesMutation.mutate("adjustment"); }}>
              <label>Adjustment name<input value={adjustmentName} onChange={(event) => setAdjustmentName(event.target.value)} required maxLength={120} /></label>
              <label>Percentage (+ surcharge / − discount)<input type="number" min="-100" max="1000" step="0.01" value={adjustmentPercentage} onChange={(event) => setAdjustmentPercentage(Number(event.target.value))} required /></label>
              <button type="submit" disabled={!adjustmentName.trim() || pricingRulesMutation.isPending}>Add adjustment</button>
            </form>
            <ul>
              {(pricingRulesQuery.data?.adjustments ?? []).map((rule) => <li key={rule.id}>
                {rule.name} — {rule.percentage > 0 ? "+" : ""}{rule.percentage}%
                <button type="button" disabled={deletePricingRuleMutation.isPending} onClick={() => deletePricingRuleMutation.mutate({ id: rule.id, kind: "adjustment" })}>Remove</button>
              </li>)}
            </ul>
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
                <td>{service.isActive ? "Active" : "Inactive"}</td>
                <td>
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
