import type { SampleExportRow } from "./repository.js";

function safeCell(value: string | number) {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function renderSamplesCsv(rows: SampleExportRow[]) {
  const header = ["Nom", "Projet", "Expérimentateur", "Description", "Date de stockage", "Freezer", "Rack", "Box", "Position"];
  const lines = rows.map((row) => [row.name, row.project, row.experimenter, row.description, row.storedAt, row.freezer, row.rack, row.box, row.position]);
  return `\uFEFF${[header, ...lines].map((line) => line.map(safeCell).join(";")).join("\r\n")}\r\n`;
}
