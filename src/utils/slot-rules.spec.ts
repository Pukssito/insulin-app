import { describe, it, expect } from 'vitest';
import { buildSlotsFromBrands } from './slot-rules';
import { InsulinBrand } from '../models/insulin';

// Helper para construir un InsulinBrand mínimo en los tests
const brand = (overrides: Partial<InsulinBrand>): InsulinBrand => ({
  id: 'test',
  device: 'pen',
  tradeName: 'Test',
  class: 'prandial',
  speed: 'ultrarrapida',
  ...overrides,
});

describe('buildSlotsFromBrands', () => {
  it('PRANDIAL: genera "Mañana", "Tarde" y "Cena" como bolus', () => {
    const slots = buildSlotsFromBrands([
      brand({ id: 'fiasp', class: 'prandial', speed: 'ultrarrapida' }),
    ]);

    expect(slots).toHaveLength(3);
    expect(slots.map(s => s.id)).toEqual(['morning', 'afternoon', 'evening']);
    expect(slots.every(s => s.kind === 'bolus')).toBe(true);
    // Cena cubre 18-23 (estándar España: cenar 21-22h)
    expect(slots[2]).toMatchObject({
      id: 'evening',
      label: 'Cena',
      startMin: 18 * 60,
      endMin: 23 * 60,
      kind: 'bolus',
    });
  });

  it('BASAL PROLONGADA: genera "Basal noche" como basal (1 al día)', () => {
    const slots = buildSlotsFromBrands([
      brand({ id: 'lantus', class: 'basal', speed: 'prolongada' }),
    ]);

    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      id: 'basal_night',
      label: 'Basal noche',
      kind: 'basal',
      startMin: 18 * 60,
      endMin: 24 * 60 - 1,
    });
  });

  it('BASAL INTERMEDIA (NPH): genera dos franjas (mañana y noche)', () => {
    const slots = buildSlotsFromBrands([
      brand({ id: 'insulatard', class: 'basal', speed: 'intermedia' }),
    ]);

    expect(slots).toHaveLength(2);
    expect(slots.map(s => s.id)).toEqual(['nph_morning', 'nph_night']);
    expect(slots.every(s => s.kind === 'basal')).toBe(true);
  });

  it('MEZCLAS (mix): genera dos franjas con kind "both"', () => {
    const slots = buildSlotsFromBrands([
      brand({ id: 'novomix', class: 'mix', speed: 'mixta' }),
    ]);

    expect(slots).toHaveLength(2);
    expect(slots.map(s => s.id)).toEqual(['mix_morning', 'mix_afternoon']);
    expect(slots.every(s => s.kind === 'both')).toBe(true);
  });

  it('PRANDIAL + BASAL combinadas: coexisten sin duplicar ids', () => {
    const slots = buildSlotsFromBrands([
      brand({ id: 'fiasp', class: 'prandial', speed: 'ultrarrapida' }),
      brand({ id: 'lantus', class: 'basal', speed: 'prolongada' }),
    ]);

    // 3 prandial (mañana/tarde/cena) + 1 basal prolongada = 4
    expect(slots).toHaveLength(4);
    const ids = slots.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length); // sin duplicados
    expect(ids).toContain('morning');
    expect(ids).toContain('afternoon');
    expect(ids).toContain('evening');
    expect(ids).toContain('basal_night');
  });

  it('Sin insulinas: aplica fallback para evitar pantalla vacía', () => {
    const slots = buildSlotsFromBrands([]);

    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      id: 'morning',
      label: 'Mañana',
      kind: 'both',
    });
  });
});
