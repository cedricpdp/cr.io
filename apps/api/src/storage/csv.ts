import type { SampleExportRow } from "./repository.js";

function safeCell(value: string | number) {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function renderSamplesCsv(rows: SampleExportRow[]) {
  const header = ["Identifiant", "Nom", "Projet", "Date de stockage", "Freezer", "Rack", "Box", "Position"];
  const lines = rows.map((row) => [row.externalId, row.name, row.project, row.storedAt, row.freezer, row.rack, row.box, row.position]);
  return `\uFEFF${[header, ...lines].map((line) => line.map(safeCell).join(";")).join("\r\n")}\r\n`;
}
