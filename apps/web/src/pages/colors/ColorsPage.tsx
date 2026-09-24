import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api-client.js";
import {
  createColor,
  listColors,
  setColorActive,
  updateColor,
  type Color,
  type CreateColorInput,
} from "../../lib/colors-api.js";
import { hasPermission } from "../../lib/permissions.js";
import { useAuthStore } from "../../state/auth-store.js";

const EMPTY_FORM: CreateColorInput = {
  name: "",
};

export function ColorsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const canManage = hasPermission(user, "colors.manage");

  const [status, setStatus] =
    useState<"active" | "inactive" | "all">("active");
  const [search, setSearch] = useState("");
  const [editingColor, setEditingColor] = useState<Color | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CreateColorInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const colorsQuery = useQuery({
    queryKey: ["colors", { status, search }],
    queryFn: () =>
      listColors(
        {
          status,
          search: search || undefined,
        },
        { accessToken },
      ),
    enabled: Boolean(accessToken),
  });

  const saveMutation = useMutation({
    mutationFn: async (input: CreateColorInput) => {
      if (editingColor) {
        return updateColor(editingColor.id, input, { accessToken });
      }

      return createColor(input, { accessToken });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["colors"] });
      closeForm();
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Unable to save colour. Please try again.",
      );
    },
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      setColorActive(input.id, input.isActive, { accessToken }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["colors"] });
    },
  });

  function closeForm() {
    setFormOpen(false);
    setEditingColor(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function openCreate() {
    setEditingColor(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(color: Color) {
    setEditingColor(color);
    setForm({ name: color.name });
    setFormError(null);
    setFormOpen(true);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const name = form.name.trim();

    if (!name) {
      setFormError("Colour name is required.");
      return;
    }

    saveMutation.mutate({ name });
  }

  const colors = colorsQuery.data?.data ?? [];

  return (
    <main>
      <h1>Colour Catalogue</h1>

      <div>
        <input
          type="search"
          placeholder="Search colours"
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

        {canManage ? (
          <button type="button" onClick={openCreate}>
            + Add New Colour
          </button>
        ) : null}
      </div>

      {colorsQuery.isLoading && <p>Loading colours...</p>}

      {colorsQuery.isError && (
        <p role="alert">
          {colorsQuery.error instanceof ApiError
            ? colorsQuery.error.message
            : "Failed to load colours. Please try again."}
        </p>
      )}

      {colorsQuery.isSuccess && colors.length === 0 && (
        <p>
          {search
            ? "No colours match your search."
            : "No colours found."}
        </p>
      )}

      {colors.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Colour</th>
              <th>Status</th>
              {canManage ? <th aria-label="Actions" /> : null}
            </tr>
          </thead>

          <tbody>
            {colors.map((color) => (
              <tr key={color.id}>
                <td>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => openEdit(color)}
                    >
                      {color.name}
                    </button>
                  ) : (
                    color.name
                  )}
                </td>

                <td>{color.isActive ? "Active" : "Inactive"}</td>

                {canManage ? (
                  <td>
                    <button
                      type="button"
                      disabled={statusMutation.isPending}
                      onClick={() =>
                        statusMutation.mutate({
                          id: color.id,
                          isActive: !color.isActive,
                        })
                      }
                    >
                      {color.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {formOpen && canManage ? (
        <section>
          <h2>{editingColor ? "Edit colour" : "Add new colour"}</h2>

          <form onSubmit={handleSubmit}>
            <label>
              Colour name
              <input
                value={form.name}
                onChange={(event) =>
                  setForm({ name: event.target.value })
                }
                autoFocus
              />
            </label>

            {formError && <p role="alert">{formError}</p>}

            <button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending
                ? "Saving..."
                : editingColor
                  ? "Save changes"
                  : "Add colour"}
            </button>

            <button type="button" onClick={closeForm}>
              Cancel
            </button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
