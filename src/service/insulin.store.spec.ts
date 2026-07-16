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

  /* ============================================================
   *  11. timeIso opcional — permite registrar dosis pasadas
   * ============================================================ */
  it('addBolus: acepta un timeIso personalizado para registrar dosis pasadas', () => {
    const today = toYmdLocal();
    const pastTime = '2026-07-16T08:30:00.000Z';

    store.addBolus('morning', 2, pastTime);

    const entries = store.getEntriesFor(today, 'morning');
    expect(entries.length).toBe(1);
    expect(entries[0].type).toBe('bolus');
    expect(entries[0].units).toBe(2);
    expect(entries[0].timeIso).toBe(pastTime);
  });

  it('toggleBasal: acepta un timeIso personalizado para registrar la basal a una hora distinta', () => {
    const today = toYmdLocal();
    const pastTime = '2026-07-16T07:15:00.000Z';

    store.toggleBasal('morning', pastTime);

    expect(store.basalDone(today, 'morning')).toBe(true);
    const last = store.getLastEntryTime(today, 'morning', 'basal');
    expect(last).toBe(pastTime);
  });

  it('addBolus: si no se pasa timeIso, usa la hora actual (comportamiento por defecto)', () => {
    const today = toYmdLocal();
    const before = Date.now();

    store.addBolus('morning', 1);

    const after = Date.now();
    const entries = store.getEntriesFor(today, 'morning');
    expect(entries.length).toBe(1);
    const stored = new Date(entries[0].timeIso).getTime();
    // El timestamp guardado está entre before y after (con un margen por ms)
    expect(stored).toBeGreaterThanOrEqual(before - 10);
    expect(stored).toBeLessThanOrEqual(after + 10);
  });

  /* ============================================================
   *  12. updateBasalTime / updateLastBolusTime — edición
   * ============================================================ */
  it('updateBasalTime: cambia el timeIso de la basal del slot', () => {
    const today = toYmdLocal();
    store.toggleBasal('morning');

    const oldTime = store.getLastEntryTime(today, 'morning', 'basal');
    expect(oldTime).not.toBeNull();

    const newTime = '2026-07-16T07:30:00.000Z';
    store.updateBasalTime('morning', newTime);

    expect(store.getLastEntryTime(today, 'morning', 'basal')).toBe(newTime);
    // basalDone sigue siendo true (solo cambió la hora, no el estado)
    expect(store.basalDone(today, 'morning')).toBe(true);
  });

  it('updateBasalTime: no hace nada si no hay basal registrada', () => {
    const today = toYmdLocal();
    expect(store.basalDone(today, 'morning')).toBe(false);

    // No debe lanzar ni crear entries fantasma
    store.updateBasalTime('morning', '2026-07-16T07:30:00.000Z');

    expect(store.basalDone(today, 'morning')).toBe(false);
    expect(store.getEntriesFor(today, 'morning')).toEqual([]);
  });

  it('updateLastBolusTime: cambia el timeIso del ÚLTIMO bolus del slot', () => {
    const today = toYmdLocal();
    store.addBolus('morning', 1, '2026-07-16T08:00:00.000Z');
    store.addBolus('morning', 2, '2026-07-16T09:00:00.000Z');
    expect(store.bolusSum(today, 'morning')).toBe(3);

    const newTime = '2026-07-16T09:30:00.000Z';
    store.updateLastBolusTime('morning', newTime);

    // El más reciente ahora tiene la nueva hora
    expect(store.getLastEntryTime(today, 'morning', 'bolus')).toBe(newTime);
    // El total NO cambia (solo cambiamos la hora, no las unidades)
    expect(store.bolusSum(today, 'morning')).toBe(3);
  });

  it('updateLastBolusTime: no afecta a bolus anteriores del mismo slot', () => {
    const today = toYmdLocal();
    store.addBolus('morning', 1, '2026-07-16T08:00:00.000Z');
    store.addBolus('morning', 2, '2026-07-16T09:00:00.000Z');

    store.updateLastBolusTime('morning', '2026-07-16T09:30:00.000Z');

    const entries = store.getEntriesFor(today, 'morning');
    const bolusEntries = entries.filter(e => e.type === 'bolus');
    expect(bolusEntries.length).toBe(2);
    // El primero (08:00) no se tocó
    expect(bolusEntries[0].timeIso).toBe('2026-07-16T08:00:00.000Z');
    // El segundo (era 09:00) ahora es 09:30
    expect(bolusEntries[1].timeIso).toBe('2026-07-16T09:30:00.000Z');
  });

  it('updateLastBolusTime: no hace nada si no hay bolus registrado', () => {
    expect(() => store.updateLastBolusTime('morning', '2026-07-16T09:30:00.000Z')).not.toThrow();
    expect(store.getEntriesFor(toYmdLocal(), 'morning')).toEqual([]);
  });

  /* ============================================================
   *  13. timeIso? en setGlucose y addNote (consistencia)
   * ============================================================ */
  it('setGlucose: acepta un timeIso personalizado para registrar glucosas pasadas', () => {
    const today = toYmdLocal();
    const pastTime = '2026-07-16T08:00:00.000Z';
    store.setGlucose('morning', 120, pastTime);
    expect(store.getGlucose(today, 'morning')).toBe(120);
  });

  it('addNote: acepta un timeIso personalizado para registrar notas pasadas', () => {
    const today = toYmdLocal();
    const pastTime = '2026-07-16T08:00:00.000Z';
    store.addNote('morning', 'comida pesada', pastTime);
    const notes = store.getNotesFor(today, 'morning');
    expect(notes.length).toBe(1);
    expect(notes[0].timeIso).toBe(pastTime);
    expect(notes[0].text).toBe('comida pesada');
  });

  /* ============================================================
   *  14. updateBolusTimeByTimestamp — editar un bolus concreto
   * ============================================================ */
  it('updateBolusTimeByTimestamp: cambia SOLO el bolus con ese timeIso', () => {
    const today = toYmdLocal();
    store.addBolus('morning', 1, '2026-07-16T08:00:00.000Z');
    store.addBolus('morning', 2, '2026-07-16T09:00:00.000Z');
    store.addBolus('morning', 3, '2026-07-16T10:00:00.000Z');

    // Editamos SOLO el del medio
    store.updateBolusTimeByTimestamp('morning', '2026-07-16T09:00:00.000Z', '2026-07-16T09:30:00.000Z');

    const entries = store.getEntriesFor(today, 'morning');
    const bolus = entries.filter(e => e.type === 'bolus');
    expect(bolus.length).toBe(3);
    expect(bolus[0].timeIso).toBe('2026-07-16T08:00:00.000Z'); // intacto
    expect(bolus[1].timeIso).toBe('2026-07-16T09:30:00.000Z'); // editado
    expect(bolus[2].timeIso).toBe('2026-07-16T10:00:00.000Z'); // intacto
    // Las unidades no cambian
    expect(bolus[1].units).toBe(2);
  });

  it('updateBolusTimeByTimestamp: no afecta nada si el timeIso no existe', () => {
    const today = toYmdLocal();
    store.addBolus('morning', 1, '2026-07-16T08:00:00.000Z');

    store.updateBolusTimeByTimestamp('morning', '2099-01-01T00:00:00.000Z', '2026-07-16T09:00:00.000Z');

    const entries = store.getEntriesFor(today, 'morning');
    expect(entries.length).toBe(1);
    expect(entries[0].timeIso).toBe('2026-07-16T08:00:00.000Z');
  });

  /* ============================================================
   *  15. updateGlucoseTime y updateLastNoteTime
   * ============================================================ */
  it('updateGlucoseTime: cambia el timeIso de la glucosa del slot', () => {
    const today = toYmdLocal();
    store.setGlucose('morning', 120);
    const oldTime = (store as any)._glucoseEntries().find(
      (g: any) => g.dateYmd === today && g.slotId === 'morning'
    ).timeIso;
    expect(oldTime).toBeTruthy();

    store.updateGlucoseTime('morning', '2026-07-16T08:00:00.000Z');

    const newTime = (store as any)._glucoseEntries().find(
      (g: any) => g.dateYmd === today && g.slotId === 'morning'
    ).timeIso;
    expect(newTime).toBe('2026-07-16T08:00:00.000Z');
    // El valor no cambia
    expect(store.getGlucose(today, 'morning')).toBe(120);
  });

  it('updateLastNoteTime: cambia el timeIso de la ÚLTIMA nota del slot', () => {
    const today = toYmdLocal();
    store.addNote('morning', 'primera', '2026-07-16T08:00:00.000Z');
    store.addNote('morning', 'segunda', '2026-07-16T09:00:00.000Z');

    store.updateLastNoteTime('morning', '2026-07-16T09:30:00.000Z');

    const notes = store.getNotesFor(today, 'morning');
    expect(notes.length).toBe(2);
    expect(notes[0].timeIso).toBe('2026-07-16T08:00:00.000Z'); // primera intacta
    expect(notes[1].timeIso).toBe('2026-07-16T09:30:00.000Z'); // segunda editada
  });
});
