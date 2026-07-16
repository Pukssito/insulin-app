import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

// Hoisted mock state
const { mockStore, resetMocks } = vi.hoisted(() => {
  const store: Record<string, string> = {};
  return {
    mockStore: store,
    resetMocks: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
});

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({
      value: mockStore[key] ?? null,
    })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      mockStore[key] = value;
    }),
  },
}));

import { DaySummary } from './day-summary';
import { InsulinStore } from './insulin.store';
import { toYmdLocal } from '../utils/date-utils';

const flushMicrotasks = async (times = 5) => {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
};

describe('DaySummary', () => {
  let store: InsulinStore;
  let daySummary: DaySummary;

  beforeEach(async () => {
    resetMocks();
    TestBed.configureTestingModule({});
    store = TestBed.inject(InsulinStore);
    daySummary = TestBed.inject(DaySummary);
    await flushMicrotasks();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  /* ============================================================
   *  daySummary
   * ============================================================ */
  it('daySummary: calcula basalExpected, basalDone, totalBolus y avgGlucose con datos reales', () => {
    // Slots por defecto: morning, afternoon, night — todos 'both'
    store.toggleBasal('morning');
    store.addBolus('morning', 3);
    store.addBolus('morning', 2);
    store.setGlucose('morning', 100);
    store.setGlucose('afternoon', 200);

    const s = daySummary.daySummary();
    expect(s.basalExpected).toBe(3);
    expect(s.basalDone).toBe(1);
    expect(s.totalBolus).toBe(5);
    expect(s.avgGlucose).toBe(150); // (100 + 200) / 2
  });

  it('daySummary: sin datos devuelve totales en 0 y avgGlucose null', () => {
    const s = daySummary.daySummary();
    expect(s.basalExpected).toBe(3); // 3 slots default
    expect(s.basalDone).toBe(0);
    expect(s.totalBolus).toBe(0);
    expect(s.avgGlucose).toBeNull();
  });

  it('daySummary: es reactivo — al añadir una basal, basalDone sube sin recargar', () => {
    expect(daySummary.daySummary().basalDone).toBe(0);
    store.toggleBasal('morning');
    expect(daySummary.daySummary().basalDone).toBe(1);
  });

  /* ============================================================
   *  missedBasalSlots
   * ============================================================ */
  it('missedBasalSlots: marca como perdida una basal cuya franja ya pasó y no se registró', () => {
    // Forzamos 18:30, después de morning (6-12) y afternoon (12-18),
    // antes del final de night (18-23:59).
    (store as any)._nowMin.set(18 * 60 + 30);

    let missed = daySummary.missedBasalSlots();
    expect(missed).toContain('morning');
    expect(missed).toContain('afternoon');
    expect(missed).not.toContain('night');

    // Marcamos morning y comprobamos que sale de la lista
    store.toggleBasal('morning');
    missed = daySummary.missedBasalSlots();
    expect(missed).not.toContain('morning');
    expect(missed).toContain('afternoon');
  });

  it('missedBasalSlots: si la franja aún no ha terminado, no se considera perdida', () => {
    // 10:00 — morning termina a las 12:00, todavía no es "pasada"
    (store as any)._nowMin.set(10 * 60);
    const missed = daySummary.missedBasalSlots();
    expect(missed).not.toContain('morning');
  });

  it('missedBasalSlots: ignora slots que no requieren basal (kind "bolus")', () => {
    // Sustituimos los slots por uno de tipo 'bolus' y verificamos
    // que no se marca como perdida aunque haya pasado su franja.
    (store as any)._slots.set([
      { id: 'lunch', label: 'Comida', startMin: 13 * 60, endMin: 15 * 60, kind: 'bolus' },
    ]);
    (store as any)._nowMin.set(16 * 60); // después de que termine

    const missed = daySummary.missedBasalSlots();
    expect(missed).not.toContain('lunch');
  });
});
