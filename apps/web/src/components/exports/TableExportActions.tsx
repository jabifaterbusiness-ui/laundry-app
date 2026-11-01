import { useState } from "react";
import { downloadExcelXml, writePrintableTable, type ExportColumn } from "../../lib/table-export.js";

interface Props<T> {
  title: string;
  filename: string;
  columns: ExportColumn<T>[];
  loadRows: () => Promise<T[]>;
}
export function TableExportActions<T>({ title, filename, columns, loadRows }: Props<T>) {
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function exportExcel() {
    setBusy("excel"); setError(null);
    try { downloadExcelXml(title, filename, columns, await loadRows()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not export this list."); }
    finally { setBusy(null); }
  }
  async function exportPdf() {
    const target = window.open("", "_blank");
    if (!target) { setError("Your browser blocked the print window. Allow pop-ups and try again."); return; }
    setBusy("pdf"); setError(null);
    try { writePrintableTable(target, title, columns, await loadRows()); }
    catch (reason) { target.close(); setError(reason instanceof Error ? reason.message : "Could not prepare the PDF export."); }
    finally { setBusy(null); }
  }
  return <div className="table-export-actions" aria-label={"Export " + title}>
    <span>Export all records</span>
    <button type="button" onClick={() => void exportExcel()} disabled={busy !== null}>{busy === "excel" ? "Preparing Excel…" : "Excel (.xls)"}</button>
    <button type="button" onClick={() => void exportPdf()} disabled={busy !== null}>{busy === "pdf" ? "Preparing PDF…" : "PDF"}</button>
    {error ? <span className="table-export-error" role="alert">{error}</span> : null}
  </div>;
}
