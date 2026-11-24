/** Pruebas unitarias de subtotales, totales y conversión de EUR a COP. */

import { calculateLineSubtotal, calculateOrderTotal, convertEurToCop } from './order-pricing';

describe('export order pricing', () => {
  it('calculates decimal line subtotals and sums rounded detail values', () => {
    const lines = [
      { quantityKg: '12.35', unitPriceEur: '8.50' },
      { quantityKg: '2.40', unitPriceEur: '6.80' },
    ];
    expect(calculateLineSubtotal(lines[0])).toBe(104.98);
    expect(calculateOrderTotal(lines)).toBe(121.30);
  });

  it('converts the rounded EUR total using the supplied COP rate', () => {
    expect(convertEurToCop(121.3, 4200)).toBe(509460);
  });
});
