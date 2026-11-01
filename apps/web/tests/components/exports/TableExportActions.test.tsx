import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TableExportActions } from "../../../src/components/exports/TableExportActions.js";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalCreateObjectURL) {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
  } else {
    Reflect.deleteProperty(URL, "createObjectURL");
  }
  if (originalRevokeObjectURL) {
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectURL });
  } else {
    Reflect.deleteProperty(URL, "revokeObjectURL");
  }
});

describe("TableExportActions", () => {
  it("loads the complete data set and downloads an Excel-readable workbook", async () => {
    const createObjectURL = vi.fn(() => "blob:laundryangel-export");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const loadRows = vi.fn().mockResolvedValue([{ name: "Jane & John" }]);

    render(<TableExportActions
      title="Customers"
      filename="customers"
      loadRows={loadRows}
      columns={[{ header: "Name", value: (row: { name: string }) => row.name }]}
    />);

    fireEvent.click(screen.getByRole("button", { name: /excel/i }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob)));
    expect(loadRows).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("opens a print-ready table and invokes the browser PDF print dialog", async () => {
    const written: string[] = [];
    const print = vi.fn();
    const popup = {
      document: {
        open: vi.fn(),
        write: vi.fn((html: string) => written.push(html)),
        close: vi.fn(),
      },
      focus: vi.fn(),
      setTimeout: vi.fn((callback: () => void) => { callback(); return 1; }),
      print,
      close: vi.fn(),
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);
    const loadRows = vi.fn().mockResolvedValue([{ name: "A & B" }]);

    render(<TableExportActions
      title="Price list"
      filename="price-list"
      loadRows={loadRows}
      columns={[{ header: "Service", value: (row: { name: string }) => row.name }]}
    />);

    fireEvent.click(screen.getByRole("button", { name: /pdf/i }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(loadRows).toHaveBeenCalledTimes(1);
    expect(written.join("")).toContain("A &amp; B");
    expect(written.join("")).toContain("Price list");
  });
});
