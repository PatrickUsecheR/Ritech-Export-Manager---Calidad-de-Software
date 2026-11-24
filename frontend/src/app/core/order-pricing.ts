/** Cálculos de órdenes en EUR con unidades menores enteras para reducir errores de redondeo. */

export interface PricedLine {
  quantityKg: number | string;
  unitPriceEur: number | string;
}

function minorUnits(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function calculateLineSubtotal(line: PricedLine): number {
  const quantityCents = minorUnits(line.quantityKg);
  const unitPriceCents = minorUnits(line.unitPriceEur);
  return Math.round((quantityCents * unitPriceCents) / 100) / 100;
}

export function calculateOrderTotal(lines: PricedLine[]): number {
  const subtotalCents = lines.reduce(
    (total, line) => total + Math.round(calculateLineSubtotal(line) * 100),
    0,
  );
  return subtotalCents / 100;
}

export function convertEurToCop(totalEur: number, copPerEur: number): number {
  const totalCents = minorUnits(totalEur);
  const rateCents = minorUnits(copPerEur);
  return Math.round((totalCents * rateCents) / 100) / 100;
}
