import { describe, it, expect } from 'vitest';
import { buildSlotsFromBrands, validateSlotOverrides } from './slot-rules';
import { InsulinBrand } from '../models/insulin';
import { SlotOverride } from '../models/profile';

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
      label: 'Noche',
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
      label: 'Basal',
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

describe('buildSlotsFromBrands con slotOverrides', () => {
  it('BASAL prolongada: timeMin 8:00 → slot de 1h (8:00–9:00)', () => {
    const slots = buildSlotsFromBrands(
      [brand({ id: 'lantus', class: 'basal', speed: 'prolongada' })],
      { basal_night: { timeMin: 8 * 60 } },
    );

    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      id: 'basal_night',
      startMin: 8 * 60,
      endMin: 9 * 60,
      kind: 'basal',
    });
    // El label por defecto se mantiene si no se sobreescribe
    expect(slots[0].label).toBe('Basal');
  });

  it('BASAL prolongada: label custom sustituye al por defecto', () => {
    const slots = buildSlotsFromBrands(
      [brand({ id: 'lantus', class: 'basal', speed: 'prolongada' })],
      { basal_night: { timeMin: 8 * 60, label: 'Lantus de la mañana' } },
    );

    expect(slots[0].label).toBe('Lantus de la mañana');
  });

  it('PRANDIAL: startMin/endMin custom sustituyen al por defecto', () => {
    const slots = buildSlotsFromBrands(
      [brand({ id: 'fiasp', class: 'prandial', speed: 'ultrarrapida' })],
      { evening: { startMin: 21 * 60, endMin: 23 * 60 } },
    );

    const cena = slots.find(s => s.id === 'evening')!;
    expect(cena).toMatchObject({
      id: 'evening',
      startMin: 21 * 60,
      endMin: 23 * 60,
      kind: 'bolus',
    });
  });

  it('NPH: timeMin 8:00 mañana y 22:00 noche → 2 slots de 1h', () => {
    const slots = buildSlotsFromBrands(
      [brand({ id: 'insulatard', class: 'basal', speed: 'intermedia' })],
      {
        nph_morning: { timeMin: 8 * 60 },
        nph_night: { timeMin: 22 * 60 },
      },
    );

    expect(slots).toHaveLength(2);
    const morning = slots.find(s => s.id === 'nph_morning')!;
    const night = slots.find(s => s.id === 'nph_night')!;
    expect(morning).toMatchObject({ startMin: 8 * 60, endMin: 9 * 60 });
    expect(night).toMatchObject({ startMin: 22 * 60, endMin: 23 * 60 });
  });

  it('Override de un slot no afecta al resto', () => {
    const slots = buildSlotsFromBrands(
      [
        brand({ id: 'fiasp', class: 'prandial', speed: 'ultrarrapida' }),
        brand({ id: 'lantus', class: 'basal', speed: 'prolongada' }),
      ],
      { basal_night: { timeMin: 8 * 60 } },
    );

    const basal = slots.find(s => s.id === 'basal_night')!;
    const cena = slots.find(s => s.id === 'evening')!;
    expect(basal.startMin).toBe(8 * 60);
    expect(cena.startMin).toBe(18 * 60); // sin tocar
  });

  it('Override con slotId que no existe: se ignora silenciosamente', () => {
    const slots = buildSlotsFromBrands(
      [brand({ id: 'lantus', class: 'basal', speed: 'prolongada' })],
      { slot_inexistente: { timeMin: 10 * 60 } },
    );

    expect(slots).toHaveLength(1);
    expect(slots[0].id).toBe('basal_night');
    expect(slots[0].startMin).toBe(18 * 60); // sin afectar
  });

  it('Overrides vacío / undefined: comportamiento idéntico al sin-override', () => {
    const a = buildSlotsFromBrands([brand({ id: 'lantus', class: 'basal', speed: 'prolongada' })]);
    const b = buildSlotsFromBrands(
      [brand({ id: 'lantus', class: 'basal', speed: 'prolongada' })],
      {},
    );
    const c = buildSlotsFromBrands(
      [brand({ id: 'lantus', class: 'basal', speed: 'prolongada' })],
      undefined,
    );

    expect(a).toEqual(b);
    expect(a).toEqual(c);
  });
});

describe('validateSlotOverrides', () => {
  const defaultSlots = buildSlotsFromBrands([
    brand({ id: 'lantus', class: 'basal', speed: 'prolongada' }),
  ]);

  it('Sin overrides: OK', () => {
    expect(() => validateSlotOverrides({}, defaultSlots)).not.toThrow();
    expect(() => validateSlotOverrides(undefined, defaultSlots)).not.toThrow();
  });

  it('Override válido de basal: OK', () => {
    expect(() =>
      validateSlotOverrides({ basal_night: { timeMin: 8 * 60 } }, defaultSlots),
    ).not.toThrow();
  });

  it('Override válido de prandial: OK', () => {
    const slots = buildSlotsFromBrands([
      brand({ id: 'fiasp', class: 'prandial', speed: 'ultrarrapida' }),
    ]);
    expect(() =>
      validateSlotOverrides(
        { evening: { startMin: 21 * 60, endMin: 23 * 60 } },
        slots,
      ),
    ).not.toThrow();
  });

  it('Override de slot inexistente: throw', () => {
    expect(() =>
      validateSlotOverrides({ slot_inexistente: { timeMin: 8 * 60 } }, defaultSlots),
    ).toThrow(/slot_inexistente/);
  });

  it('Basal sin timeMin: throw', () => {
    expect(() =>
      validateSlotOverrides({ basal_night: {} as SlotOverride }, defaultSlots),
    ).toThrow(/timeMin/);
  });

  it('Prandial sin startMin/endMin: throw', () => {
    const slots = buildSlotsFromBrands([
      brand({ id: 'fiasp', class: 'prandial', speed: 'ultrarrapida' }),
    ]);
    expect(() =>
      validateSlotOverrides({ evening: { timeMin: 21 * 60 } }, slots),
    ).toThrow(/startMin/);
  });

  it('timeMin negativo: throw', () => {
    expect(() =>
      validateSlotOverrides({ basal_night: { timeMin: -10 } }, defaultSlots),
    ).toThrow(/fuera de rango/);
  });

  it('timeMin >= 24h: throw', () => {
    expect(() =>
      validateSlotOverrides({ basal_night: { timeMin: 24 * 60 } }, defaultSlots),
    ).toThrow(/fuera de rango/);
  });

  it('endMin <= startMin: throw', () => {
    const slots = buildSlotsFromBrands([
      brand({ id: 'fiasp', class: 'prandial', speed: 'ultrarrapida' }),
    ]);
    expect(() =>
      validateSlotOverrides(
        { evening: { startMin: 22 * 60, endMin: 22 * 60 } },
        slots,
      ),
    ).toThrow(/endMin/);
  });

  it('endMin fuera de rango (>= 24h): throw', () => {
    const slots = buildSlotsFromBrands([
      brand({ id: 'fiasp', class: 'prandial', speed: 'ultrarrapida' }),
    ]);
    expect(() =>
      validateSlotOverrides(
        { evening: { startMin: 22 * 60, endMin: 24 * 60 } },
        slots,
      ),
    ).toThrow(/fuera de \[0, 24h\)/);
  });
});
