import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import {
  createService,
  listServices,
  setServiceActive,
  updateService,
  type CreateServiceInput,
  type Service,
} from "../../lib/services-api.js";
import { useAuthStore } from "../../state/auth-store.js";

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

  const services = servicesQuery.data?.data ?? [];

  return (
    <main>
      <h1>Services & Price List</h1>

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
