export function rowLabel(rowIndex: number) {
  let value = rowIndex + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

export function positionLabel(position: number, columns = 8) {
  return `${rowLabel(Math.floor((position - 1) / columns))}${((position - 1) % columns) + 1}`;
}

export function parsePositionLabel(value: string, rows: number, columns: number) {
  const match = /^([a-z]+)\s*([1-9]\d*)$/i.exec(value.trim());
  if (!match) return undefined;

  const row = [...match[1].toUpperCase()].reduce((result, letter) => result * 26 + letter.charCodeAt(0) - 64, 0);
  const column = Number(match[2]);
  if (row < 1 || row > rows || column < 1 || column > columns) return undefined;
  return (row - 1) * columns + column;
}
