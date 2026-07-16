import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';

// Hoisted mock state: must be declared before vi.mock() factories
// so the factory closures can reference these references.
const { mockStore, resetMocks } = vi.hoisted(() => {
  const store: Record<string, string> = {};
  return {
    mockStore: store,
    resetMocks: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
});

// Mock Capacitor Preferences (storage used by the store)
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

// Import the store AFTER the mocks are declared
import { InsulinStore } from './insulin.store';
import { toYmdLocal } from '../utils/date-utils';

// Wait for the microtasks queued by the store constructor
// (loadFromStorage kicks off async work).
const flushMicrotasks = async (times = 5) => {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
};

describe('InsulinStore', () => {
  let store: InsulinStore;

  beforeEach(async () => {
    resetMocks();
    TestBed.configureTestingModule({});
    store = TestBed.inject(InsulinStore);
    await flushMicrotasks();
  });

  afterEach(() => {
    // Wipe the TestBed so the next test gets a fresh store instance.
    // This also stops the setInterval started by the store constructor.
    TestBed.resetTestingModule();
  });

  /* ============================================================
   *  1. toggleBasal — añade y quita una basal del día actual
   * ============================================================ */
  it('toggleBasal: añade una basal cuando no existe y la quita cuando ya existe', () => {
    const today = toYmdLocal();
    expect(store.basalDone(today, 'morning')).toBe(false);

    store.toggleBasal('morning');
    expect(store.basalDone(today, 'morning')).toBe(true);

    store.toggleBasal('morning');
    expect(store.basalDone(today, 'morning')).toBe(false);
  });

  /* ============================================================
   *  2. addBolus — suma al total y valida rangos
   * ============================================================ */
  it('addBolus: suma al slot y rechaza unidades fuera de [0.5, 50]', () => {
    const today = toYmdLocal();

    // Válidas
    store.addBolus('morning', 2);
    store.addBolus('morning', 3);
    expect(store.bolusSum(today, 'morning')).toBe(5);

    // Por debajo del mínimo
    store.addBolus('morning', 0.1);
    expect(store.bolusSum(today, 'morning')).toBe(5);

    // Por encima del máximo
    store.addBolus('morning', 100);
    expect(store.bolusSum(today, 'morning')).toBe(5);

    // Cero y negativo se ignoran
    store.addBolus('morning', 0);
    store.addBolus('morning', -3);
    expect(store.bolusSum(today, 'morning')).toBe(5);
  });

  /* ============================================================
   *  3. setGlucose — valida 20-600, borra en <= 0
   * ============================================================ */
  it('setGlucose: acepta valores en [20, 600], rechaza fuera de rango y borra en <= 0', () => {
    const today = toYmdLocal();

    // Fuera de rango alto
    store.setGlucose('morning', 700);
    expect(store.getGlucose(today, 'morning')).toBeNull();

    // Fuera de rango bajo
    store.setGlucose('morning', 10);
    expect(store.getGlucose(today, 'morning')).toBeNull();

    // En rango
    store.setGlucose('morning', 120);
    expect(store.getGlucose(today, 'morning')).toBe(120);

    // 0 elimina la lectura
    store.setGlucose('morning', 0);
    expect(store.getGlucose(today, 'morning')).toBeNull();

    // Negativo también elimina
    store.setGlucose('morning', 150);
    expect(store.getGlucose(today, 'morning')).toBe(150);
    store.setGlucose('morning', -5);
    expect(store.getGlucose(today, 'morning')).toBeNull();
  });

  /* ============================================================
   *  4. removeLastBolus — borra el último del slot correcto
   * ============================================================ */
  it('removeLastBolus: borra el último bolus del slot sin afectar a otros slots', () => {
    const today = toYmdLocal();

    store.addBolus('morning', 1);
    store.addBolus('morning', 2);
    store.addBolus('afternoon', 5);

    expect(store.bolusSum(today, 'morning')).toBe(3);
    expect(store.bolusSum(today, 'afternoon')).toBe(5);

    store.removeLastBolus('morning');

    expect(store.bolusSum(today, 'morning')).toBe(1);
    expect(store.bolusSum(today, 'afternoon')).toBe(5); // intacto
  });

  /* ============================================================
   *  5. getDaySummary NO EXISTE en el store — eso es DaySummary.
   *     En su lugar verificamos las queries que el store sí ofrece
   *     y que DaySummary consumirá: basalExpected-like (slot count)
   *     y totalBolus/totalBasal.
   * ============================================================ */
  it('queries básicas: basalDone, bolusSum y getEntriesFor reflejan las mutaciones', () => {
    const today = toYmdLocal();

    store.toggleBasal('morning');
    store.addBolus('morning', 3);
    store.addBolus('morning', 2);
    store.setGlucose('morning', 100);
    store.setGlucose('afternoon', 200);

    expect(store.basalDone(today, 'morning')).toBe(true);
    expect(store.bolusSum(today, 'morning')).toBe(5);
    expect(store.getGlucose(today, 'morning')).toBe(100);
    expect(store.getGlucose(today, 'afternoon')).toBe(200);

    const morningEntries = store.getEntriesFor(today, 'morning');
    expect(morningEntries.some(e => e.type === 'basal')).toBe(true);
    expect(morningEntries.filter(e => e.type === 'bolus').length).toBe(2);
  });

  /* ============================================================
   *  6. getHistoryDays — incluye días que solo tienen notas
   * ============================================================ */
  it('getHistoryDays: incluye días que solo tienen notas y los ordena descendente', () => {
    const today = toYmdLocal();
    const yesterday = '2026-07-15';

    store.toggleBasal('morning');
    // Inyectamos una nota en otro día sin entradas ni glucosa
    (store as any)._noteEntries.set([
      {
        dateYmd: yesterday,
        timeIso: '2026-07-15T10:00:00.000Z',
        slotId: 'morning',
        text: 'me sentí bien',
      },
    ]);

    const days = store.getHistoryDays();
    expect(days).toContain(today);
    expect(days).toContain(yesterday);
    expect(days[0]).toBe(today); // más reciente primero
  });

  /* ============================================================
   *  7. nowMin — DaySummary lo usará para missedBasalSlots
   * ============================================================ */
  it('nowMin: signal escribible que se inicializa con la hora actual', () => {
    // El signal arranca con los minutos del momento de creación
    const initial = store.nowMin();
    expect(initial).toBeGreaterThanOrEqual(0);
    expect(initial).toBeLessThan(24 * 60);

    // Se puede actualizar (lo usa el setInterval interno)
    (store as any)._nowMin.set(18 * 60 + 30);
    expect(store.nowMin()).toBe(18 * 60 + 30);
  });

  /* ============================================================
   *  8. getLastEntryTime — devuelve la más reciente del tipo
   * ============================================================ */
  it('getLastEntryTime: devuelve el ISO más reciente del tipo pedido y null si no hay', () => {
    const today = toYmdLocal();

    // Sin entradas: null
    expect(store.getLastEntryTime(today, 'morning', 'bolus')).toBeNull();
    expect(store.getLastEntryTime(today, 'morning', 'basal')).toBeNull();

    store.toggleBasal('morning'); // añade basal
    store.toggleBasal('morning'); // la quita
    store.toggleBasal('morning'); // la vuelve a añadir

    const lastBasal = store.getLastEntryTime(today, 'morning', 'basal');
    expect(lastBasal).not.toBeNull();
    // La más reciente debe estar muy cerca de "ahora"
    expect(new Date(lastBasal!).getTime()).toBeGreaterThan(Date.now() - 5_000);

    // Tras añadir bolus, el más reciente del tipo bolus debe ser no-null
    store.addBolus('morning', 2);
    const lastBolus = store.getLastEntryTime(today, 'morning', 'bolus');
    expect(lastBolus).not.toBeNull();
  });

  /* ============================================================
   *  9. undoLast — borra la última entrada del slot correcto
   * ============================================================ */
  it('undoLast: con slotId borra la última entrada de ese slot; sin slotId borra la última global del día', () => {
    const today = toYmdLocal();

    store.addBolus('morning', 1);
    store.addBolus('morning', 2);
    store.addBolus('afternoon', 5);

    // Con slotId: solo borra la del slot
    store.undoLast('morning');
    expect(store.bolusSum(today, 'morning')).toBe(1);
    expect(store.bolusSum(today, 'afternoon')).toBe(5);

    // Sin slotId: borra la última del día (la de afternoon)
    store.undoLast();
    expect(store.bolusSum(today, 'afternoon')).toBe(0);
  });

  /* ============================================================
   *  10. getGlucose — devuelve la más reciente si hay varias
   * ============================================================ */
  it('getGlucose: cuando hay varias lecturas para el mismo slot, devuelve la más reciente', () => {
    const today = toYmdLocal();

    // Inyectamos tres lecturas en el mismo slot a horas distintas
    (store as any)._glucoseEntries.set([
      { dateYmd: today, timeIso: '2026-07-16T08:00:00.000Z', slotId: 'morning', value: 100 },
      { dateYmd: today, timeIso: '2026-07-16T12:00:00.000Z', slotId: 'morning', value: 150 },
      { dateYmd: today, timeIso: '2026-07-16T18:00:00.000Z', slotId: 'morning', value: 200 },
    ]);

    // Comportamiento correcto: la última lectura (200)
    expect(store.getGlucose(today, 'morning')).toBe(200);
  });
});
