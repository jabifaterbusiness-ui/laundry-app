export interface ExportColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

function xmlEscape(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function printableValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
export function downloadExcelXml<T>(title: string, filename: string, columns: ExportColumn<T>[], rows: T[]): void {
  const header = columns.map((c) => '<Cell ss:StyleID="Header"><Data ss:Type="String">' + xmlEscape(c.header) + '</Data></Cell>').join("");
  const body = rows.map((row) => {
    const cells = columns.map((c) => {
      const value = printableValue(c.value(row));
      const numeric = value !== "" && /^-?\d+(\.\d+)?$/.test(value);
      return '<Cell><Data ss:Type="' + (numeric ? "Number" : "String") + '">' + xmlEscape(value) + '</Data></Cell>';
    }).join("");
    return "<Row>" + cells + "</Row>";
  }).join("");
  const xml = '<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    '<Styles><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#087F8C" ss:Pattern="Solid"/></Style></Styles>' +
    '<Worksheet ss:Name="Export"><Table><Row><Cell ss:MergeAcross="' + Math.max(columns.length - 1, 0) + '"><Data ss:Type="String">' + xmlEscape(title) + '</Data></Cell></Row><Row>' + header + '</Row>' + body + '</Table></Worksheet></Workbook>';
  const blob = new Blob(["\uFEFF", xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename + ".xls";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export function writePrintableTable<T>(target: Window, title: string, columns: ExportColumn<T>[], rows: T[]): void {
  const head = columns.map((c) => "<th>" + xmlEscape(c.header) + "</th>").join("");
  const body = rows.map((row) => "<tr>" + columns.map((c) => "<td>" + xmlEscape(printableValue(c.value(row))) + "</td>").join("") + "</tr>").join("");
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + xmlEscape(title) + '</title><style>' +
    '@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font:11px Arial,sans-serif;color:#172033;margin:0}h1{font-size:20px;margin:0 0 5px}p{color:#667085;margin:0 0 16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d9e0e7;padding:7px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#087f8c;color:#fff;font-weight:700}tbody tr:nth-child(even){background:#f4f8f9}@media print{thead{display:table-header-group}tr{break-inside:avoid}}' +
    '</style></head><body><h1>' + xmlEscape(title) + '</h1><p>Generated ' + xmlEscape(new Date().toLocaleString()) + ' · ' + rows.length.toLocaleString() + ' records</p><table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table><script>window.addEventListener("load",function(){window.focus();window.print();});</script></body></html>';
  target.document.open();
  target.document.write(html);
  target.document.close();
}
