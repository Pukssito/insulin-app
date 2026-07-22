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
   *  9. getGlucose — devuelve la más reciente si hay varias
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
   *  10. timeIso opcional — permite registrar dosis pasadas
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
   *  11. updateBasalTime — edición de hora de basal
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

  /* ============================================================
   *  12. timeIso? en setGlucose y addNote (consistencia)
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
   *  13. updateBolusTimeByTimestamp — editar un bolus concreto
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

    // oldTimeIso inexistente pero PASADO (no futuro, para que pase
    // la validación de "no hora futura" en el store)
    store.updateBolusTimeByTimestamp('morning', '2025-01-01T00:00:00.000Z', '2026-07-16T09:00:00.000Z');

    const entries = store.getEntriesFor(today, 'morning');
    expect(entries.length).toBe(1);
    expect(entries[0].timeIso).toBe('2026-07-16T08:00:00.000Z');
  });

  /* ============================================================
   *  14. updateGlucoseTime y updateNoteTimeByTimestamp
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

  it('updateNoteTimeByTimestamp: cambia SOLO la nota con ese timeIso', () => {
    const today = toYmdLocal();
    store.addNote('morning', 'primera', '2026-07-16T08:00:00.000Z');
    store.addNote('morning', 'segunda', '2026-07-16T09:00:00.000Z');
    store.addNote('morning', 'tercera', '2026-07-16T10:00:00.000Z');

    // Editamos SOLO la del medio
    store.updateNoteTimeByTimestamp('morning', '2026-07-16T09:00:00.000Z', '2026-07-16T09:30:00.000Z');

    const notes = store.getNotesFor(today, 'morning');
    expect(notes.length).toBe(3);
    expect(notes[0].timeIso).toBe('2026-07-16T08:00:00.000Z'); // intacta
    expect(notes[1].timeIso).toBe('2026-07-16T09:30:00.000Z'); // editada
    expect(notes[2].timeIso).toBe('2026-07-16T10:00:00.000Z'); // intacta
    // El texto no cambia
    expect(notes[1].text).toBe('segunda');
  });

  it('updateNoteTimeByTimestamp: no afecta nada si el timeIso no existe', () => {
    const today = toYmdLocal();
    store.addNote('morning', 'única', '2026-07-16T08:00:00.000Z');

    // oldTimeIso inexistente pero PASADO (no futuro, para que pase
    // la validación de "no hora futura" en el store)
    store.updateNoteTimeByTimestamp('morning', '2025-01-01T00:00:00.000Z', '2026-07-16T09:00:00.000Z');

    const notes = store.getNotesFor(today, 'morning');
    expect(notes.length).toBe(1);
    expect(notes[0].timeIso).toBe('2026-07-16T08:00:00.000Z');
  });

  /* ============================================================
   *  15. assertNotFuture — todas las mutaciones rechazan hora futura
   * ============================================================ */
  it('mutaciones: rechazan timeIso futuro con throw (defensa contra datos incorrectos)', () => {
    const future = new Date(Date.now() + 60 * 60_000).toISOString(); // +1h

    // Las 8 mutaciones que aceptan timeIso deben lanzar
    expect(() => store.addBolus('morning', 1, future)).toThrow(/hora futura/);
    expect(() => store.toggleBasal('morning', future)).toThrow(/hora futura/);
    expect(() => store.setGlucose('morning', 100, future)).toThrow(/hora futura/);
    expect(() => store.addNote('morning', 'test', future)).toThrow(/hora futura/);
    expect(() => store.updateBasalTime('morning', future)).toThrow(/hora futura/);
    expect(() => store.updateBolusTimeByTimestamp('morning', future, future)).toThrow(/hora futura/);
    expect(() => store.updateGlucoseTime('morning', future)).toThrow(/hora futura/);
    expect(() => store.updateNoteTimeByTimestamp('morning', future, future)).toThrow(/hora futura/);

    // Sanity: si no se pasa timeIso, debe seguir funcionando con hora actual
    expect(() => store.toggleBasal('morning')).not.toThrow();
  });

  /* ============================================================
   *  16. exportAll — snapshot del estado para backup
   * ============================================================ */
  it('exportAll: devuelve snapshot del estado actual', () => {
    const today = toYmdLocal();
    store.toggleBasal('morning');
    store.addBolus('morning', 2);
    store.setGlucose('morning', 120);
    store.addNote('morning', 'test nota');

    const snapshot = store.exportAll();

    expect(snapshot.entries.length).toBe(2); // 1 basal + 1 bolus
    expect(snapshot.glucoseEntries.length).toBe(1);
    expect(snapshot.noteEntries.length).toBe(1);
    expect(snapshot.profile).toBeNull(); // no hemos setProfileByIds
  });

  it('exportAll: hace clones (mutar el snapshot no afecta al store)', () => {
    store.addBolus('morning', 2);
    const snapshot = store.exportAll();
    snapshot.entries[0].units = 999; // mutamos el snapshot

    // El store NO debe verse afectado
    const today = toYmdLocal();
    expect(store.bolusSum(today, 'morning')).toBe(2);
  });

  it('exportAll: profile es null si no se ha configurado', () => {
    const snapshot = store.exportAll();
    expect(snapshot.profile).toBeNull();
  });

  /* ============================================================
   *  17. replaceAll — restaurar desde backup
   * ============================================================ */
  it('replaceAll: reemplaza TODOS los datos (entries, glucose, notes, profile)', async () => {
    const today = toYmdLocal();
    // Primero: añadimos datos
    store.addBolus('morning', 5);
    store.setGlucose('morning', 200);
    store.addNote('morning', 'vieja');

    // Segundo: reemplazamos con backup vacío
    await store.replaceAll({
      profile: { brandIds: ['fiasp-pen'] },
      entries: [],
      glucoseEntries: [],
      noteEntries: [],
    });

    expect(store.bolusSum(today, 'morning')).toBe(0);
    expect(store.getGlucose(today, 'morning')).toBeNull();
    expect(store.getNotesFor(today, 'morning')).toEqual([]);
    expect(store.hasProfile()).toBe(true);
  });

  it('replaceAll: restaura los datos del backup', async () => {
    const backup = {
      profile: { brandIds: ['fiasp-pen', 'lantus-vial'] },
      entries: [
        { dateYmd: '2026-07-15', timeIso: '2026-07-15T08:00:00.000Z', slotId: 'morning', type: 'bolus' as const, units: 3 },
        { dateYmd: '2026-07-15', timeIso: '2026-07-15T09:00:00.000Z', slotId: 'morning', type: 'basal' as const, units: 1 },
      ],
      glucoseEntries: [
        { dateYmd: '2026-07-15', timeIso: '2026-07-15T10:00:00.000Z', slotId: 'morning', value: 150 },
      ],
      noteEntries: [
        { dateYmd: '2026-07-15', timeIso: '2026-07-15T12:00:00.000Z', slotId: 'afternoon', text: 'restaurado' },
      ],
    };

    await store.replaceAll(backup);

    // Verificamos que los datos están restaurados
    const morningEntries = store.getEntriesFor('2026-07-15', 'morning');
    expect(morningEntries.length).toBe(2);
    expect(morningEntries.some(e => e.type === 'basal')).toBe(true);
    expect(morningEntries.some(e => e.type === 'bolus')).toBe(true);

    expect(store.getGlucose('2026-07-15', 'morning')).toBe(150);
    expect(store.getNotesFor('2026-07-15', 'afternoon').length).toBe(1);
    expect(store.hasProfile()).toBe(true);
  });

  it('replaceAll: roundtrip con exportAll preserva todos los datos', async () => {
    const today = toYmdLocal();
    // Llenamos el store
    store.toggleBasal('morning');
    store.addBolus('morning', 2);
    store.setGlucose('morning', 100);
    store.addNote('morning', 'nota original');

    // Exportamos
    const snapshot = store.exportAll();

    // Mutamos el store
    store.addBolus('morning', 5);
    store.setGlucose('morning', 999);

    // Restauramos desde el snapshot
    await store.replaceAll(snapshot);

    // El store debe estar como antes de la mutación
    expect(store.bolusSum(today, 'morning')).toBe(2); // 1 basal (1 unit) + 1 bolus (2) ... espera, basal cuenta como 1 en bolusSum?
    // bolusSum solo cuenta 'bolus', no 'basal'. Así que bolusSum = 2.
    expect(store.bolusSum(today, 'morning')).toBe(2);
    expect(store.getGlucose(today, 'morning')).toBe(100);
    expect(store.getNotesFor(today, 'morning').length).toBe(1);
  });

  /* ============================================================
   *  18. setProfileByIds con slotOverrides
   * ============================================================ */
  it('setProfileByIds: persiste el profile SIN slotOverrides cuando no se pasan', async () => {
    await store.setProfileByIds(['fiasp-pen']);
    const profile = store.profile();
    expect(profile).not.toBeNull();
    expect(profile!.brandIds).toEqual(['fiasp-pen']);
    expect(profile!.slotOverrides).toBeUndefined();
  });

  it('setProfileByIds: aplica slotOverrides de basal sobre los slots por defecto', async () => {
    await store.setProfileByIds(['lantus-vial'], {
      basal_night: { timeMin: 8 * 60 }, // la madre se la pone a las 8:00
    });

    // El slot basal_night debe haber pasado de 18-23:59 a 8:00-9:00
    const basalSlot = store.slots().find(s => s.id === 'basal_night')!;
    expect(basalSlot).toBeDefined();
    expect(basalSlot.startMin).toBe(8 * 60);
    expect(basalSlot.endMin).toBe(9 * 60);
  });

  it('setProfileByIds: aplica overrides de NPH en ambas franjas', async () => {
    await store.setProfileByIds(['insulatard-vial'], {
      nph_morning: { timeMin: 8 * 60 },
      nph_night: { timeMin: 22 * 60 },
    });

    const morning = store.slots().find(s => s.id === 'nph_morning')!;
    const night = store.slots().find(s => s.id === 'nph_night')!;
    expect(morning.startMin).toBe(8 * 60);
    expect(morning.endMin).toBe(9 * 60);
    expect(night.startMin).toBe(22 * 60);
    expect(night.endMin).toBe(23 * 60);
  });

  it('setProfileByIds: lanza error si el override referencia un slotId inexistente', async () => {
    await expect(
      store.setProfileByIds(['fiasp-pen'], {
        slot_inexistente: { timeMin: 8 * 60 },
      }),
    ).rejects.toThrow(/slot_inexistente/);
  });

  it('setProfileByIds: lanza error si el override de basal no tiene timeMin', async () => {
    await expect(
      store.setProfileByIds(['lantus-vial'], {
        // @ts-expect-error -故意的, queremos forzar el error de validación
        basal_night: { startMin: 8 * 60, endMin: 9 * 60 },
      }),
    ).rejects.toThrow(/requiere timeMin/);
  });

  it('setProfileByIds: los slotOverrides del profile viejo NO contaminan al nuevo', async () => {
    // Primera config: con override de basal
    await store.setProfileByIds(['lantus-vial'], {
      basal_night: { timeMin: 8 * 60 },
    });
    expect(store.slots().find(s => s.id === 'basal_night')!.startMin).toBe(8 * 60);

    // Segunda config: SIN override. La basal debe volver al default (18:00)
    await store.setProfileByIds(['lantus-vial']);

    const basal = store.slots().find(s => s.id === 'basal_night')!;
    expect(basal.startMin).toBe(18 * 60);
  });

  it('loadFromStorage: rehidrata los slotOverrides desde Preferences', async () => {
    // Persistimos un profile con override
    await store.setProfileByIds(['lantus-vial'], {
      basal_night: { timeMin: 8 * 60, label: 'Lantus mañana' },
    });

    // Simulamos un reinicio: creamos un store nuevo que lee de Preferences
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fresh = TestBed.inject(InsulinStore);
    await flushMicrotasks();

    const basal = fresh.slots().find(s => s.id === 'basal_night')!;
    expect(basal.startMin).toBe(8 * 60);
    expect(basal.endMin).toBe(9 * 60);
    expect(basal.label).toBe('Lantus mañana');
  });
});
