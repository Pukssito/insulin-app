import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';

// Hoisted mock state: must be declared before vi.mock() factories
// so the factory closures can reference these references.
const { mockStore, mockSchedule, resetMocks } = vi.hoisted(() => {
  const store: Record<string, string> = {};
  const schedule = vi.fn();
  return {
    mockStore: store,
    mockSchedule: schedule,
    resetMocks: () => {
      for (const k of Object.keys(store)) delete store[k];
      schedule.mockClear();
    },
  };
});

// Mock Capacitor Preferences (storage used by the service)
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

// Mock Capacitor LocalNotifications
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: vi.fn(async () => ({ display: 'granted' })),
    requestPermissions: vi.fn(async () => ({ display: 'granted' })),
    schedule: mockSchedule,
  },
}));

// Import the service AFTER the mocks are declared
import { InsulinService } from './insulin.service';
import { toYmdLocal } from '../utils/date-utils';

// Wait for the microtasks queued by the service constructor
// (loadFromStorage + ensureNotifPermission kick off async work).
const flushMicrotasks = async (times = 5) => {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
};

describe('InsulinService', () => {
  let service: InsulinService;

  beforeEach(async () => {
    resetMocks();
    TestBed.configureTestingModule({});
    service = TestBed.inject(InsulinService);
    await flushMicrotasks();
  });

  afterEach(() => {
    // Wipe the TestBed so the next test gets a fresh service instance.
    // This also stops the setInterval started by the service constructor.
    TestBed.resetTestingModule();
  });

  /* ============================================================
   *  1. toggleBasal — añade y quita una basal del día actual
   * ============================================================ */
  it('toggleBasal: añade una basal cuando no existe y la quita cuando ya existe', () => {
    const today = toYmdLocal();
    expect(service.basalDone(today, 'morning')).toBe(false);

    service.toggleBasal('morning');
    expect(service.basalDone(today, 'morning')).toBe(true);

    service.toggleBasal('morning');
    expect(service.basalDone(today, 'morning')).toBe(false);
  });

  /* ============================================================
   *  2. addBolus — suma al total y valida rangos
   * ============================================================ */
  it('addBolus: suma al slot y rechaza unidades fuera de [0.5, 50]', () => {
    const today = toYmdLocal();

    // Válidas
    service.addBolus('morning', 2);
    service.addBolus('morning', 3);
    expect(service.bolusSum(today, 'morning')).toBe(5);

    // Por debajo del mínimo
    service.addBolus('morning', 0.1);
    expect(service.bolusSum(today, 'morning')).toBe(5);

    // Por encima del máximo
    service.addBolus('morning', 100);
    expect(service.bolusSum(today, 'morning')).toBe(5);

    // Cero y negativo se ignoran
    service.addBolus('morning', 0);
    service.addBolus('morning', -3);
    expect(service.bolusSum(today, 'morning')).toBe(5);
  });

  /* ============================================================
   *  3. setGlucose — valida 20-600, borra en <= 0
   * ============================================================ */
  it('setGlucose: acepta valores en [20, 600], rechaza fuera de rango y borra en <= 0', () => {
    const today = toYmdLocal();

    // Fuera de rango alto
    service.setGlucose('morning', 700);
    expect(service.getGlucose(today, 'morning')).toBeNull();

    // Fuera de rango bajo
    service.setGlucose('morning', 10);
    expect(service.getGlucose(today, 'morning')).toBeNull();

    // En rango
    service.setGlucose('morning', 120);
    expect(service.getGlucose(today, 'morning')).toBe(120);

    // 0 elimina la lectura
    service.setGlucose('morning', 0);
    expect(service.getGlucose(today, 'morning')).toBeNull();

    // Negativo también elimina
    service.setGlucose('morning', 150);
    expect(service.getGlucose(today, 'morning')).toBe(150);
    service.setGlucose('morning', -5);
    expect(service.getGlucose(today, 'morning')).toBeNull();
  });

  /* ============================================================
   *  4. removeLastBolus — borra el último del slot correcto
   * ============================================================ */
  it('removeLastBolus: borra el último bolus del slot sin afectar a otros slots', () => {
    const today = toYmdLocal();

    service.addBolus('morning', 1);
    service.addBolus('morning', 2);
    service.addBolus('afternoon', 5);

    expect(service.bolusSum(today, 'morning')).toBe(3);
    expect(service.bolusSum(today, 'afternoon')).toBe(5);

    service.removeLastBolus('morning');

    expect(service.bolusSum(today, 'morning')).toBe(1);
    expect(service.bolusSum(today, 'afternoon')).toBe(5); // intacto
  });

  /* ============================================================
   *  5. getDaySummary — calcula con datos reales
   * ============================================================ */
  it('getDaySummary: calcula basalExpected, basalDone, totalBolus y avgGlucose correctamente', () => {
    // Slots por defecto: morning, afternoon, night — todos 'both' (basalExpected = 3)
    service.toggleBasal('morning');
    service.addBolus('morning', 3);
    service.addBolus('morning', 2);
    service.setGlucose('morning', 100);
    service.setGlucose('afternoon', 200);

    const summary = service.daySummary();
    expect(summary.basalExpected).toBe(3);
    expect(summary.basalDone).toBe(1);
    expect(summary.totalBolus).toBe(5);
    expect(summary.avgGlucose).toBe(150); // (100 + 200) / 2
  });

  /* ============================================================
   *  6. getHistoryDays — incluye días que solo tienen notas
   * ============================================================ */
  it('getHistoryDays: incluye días que solo tienen notas y los ordena descendente', () => {
    const today = toYmdLocal();
    const yesterday = '2026-07-15';

    service.toggleBasal('morning');
    // Inyectamos una nota en otro día sin entradas ni glucosa
    (service as any)._noteEntries.set([
      {
        dateYmd: yesterday,
        timeIso: '2026-07-15T10:00:00.000Z',
        slotId: 'morning',
        text: 'me sentí bien',
      },
    ]);

    const days = service.getHistoryDays();
    expect(days).toContain(today);
    expect(days).toContain(yesterday);
    expect(days[0]).toBe(today); // más reciente primero
  });

  /* ============================================================
   *  7. missedBasalSlots — detecta basal pasada sin marcar
   * ============================================================ */
  it('missedBasalSlots: marca como perdida una basal cuya franja ya pasó y no se registró', () => {
    // Forzamos la hora: 18:30, después de morning (6-12) y afternoon (12-18),
    // antes del final de night (18-23:59).
    (service as any)._nowMin.set(18 * 60 + 30);

    let missed = service.missedBasalSlots();
    expect(missed).toContain('morning');
    expect(missed).toContain('afternoon');
    expect(missed).not.toContain('night');

    // Marcamos la basal de morning y comprobamos que sale de la lista.
    service.toggleBasal('morning');
    missed = service.missedBasalSlots();
    expect(missed).not.toContain('morning');
    expect(missed).toContain('afternoon');
  });

  /* ============================================================
   *  8. getLastEntryTime — devuelve la más reciente del tipo
   * ============================================================ */
  it('getLastEntryTime: devuelve el ISO más reciente del tipo pedido y null si no hay', () => {
    const today = toYmdLocal();

    // Sin entradas: null
    expect(service.getLastEntryTime(today, 'morning', 'bolus')).toBeNull();
    expect(service.getLastEntryTime(today, 'morning', 'basal')).toBeNull();

    service.toggleBasal('morning'); // añade basal
    service.toggleBasal('morning'); // la quita
    service.toggleBasal('morning'); // la vuelve a añadir

    const lastBasal = service.getLastEntryTime(today, 'morning', 'basal');
    expect(lastBasal).not.toBeNull();
    // La más reciente debe estar muy cerca de "ahora"
    expect(new Date(lastBasal!).getTime()).toBeGreaterThan(Date.now() - 5_000);

    // Tras añadir bolus, el más reciente del tipo bolus debe ser no-null
    service.addBolus('morning', 2);
    const lastBolus = service.getLastEntryTime(today, 'morning', 'bolus');
    expect(lastBolus).not.toBeNull();
  });

  /* ============================================================
   *  9. undoLast — borra la última entrada del slot correcto
   * ============================================================ */
  it('undoLast: con slotId borra la última entrada de ese slot; sin slotId borra la última global del día', () => {
    const today = toYmdLocal();

    service.addBolus('morning', 1);
    service.addBolus('morning', 2);
    service.addBolus('afternoon', 5);

    // Con slotId: solo borra la del slot
    service.undoLast('morning');
    expect(service.bolusSum(today, 'morning')).toBe(1);
    expect(service.bolusSum(today, 'afternoon')).toBe(5);

    // Sin slotId: borra la última del día (la de afternoon)
    service.undoLast();
    expect(service.bolusSum(today, 'afternoon')).toBe(0);
  });

  /* ============================================================
   *  10. getGlucose — devuelve la más reciente si hay varias
   *  (este test CAZA un bug probable del código actual: usa
     *  .find() en lugar de ordenar por timeIso y devolver la última)
   * ============================================================ */
  it('getGlucose: cuando hay varias lecturas para el mismo slot, devuelve la más reciente', () => {
    const today = toYmdLocal();

    // Inyectamos tres lecturas en el mismo slot a horas distintas
    (service as any)._glucoseEntries.set([
      { dateYmd: today, timeIso: '2026-07-16T08:00:00.000Z', slotId: 'morning', value: 100 },
      { dateYmd: today, timeIso: '2026-07-16T12:00:00.000Z', slotId: 'morning', value: 150 },
      { dateYmd: today, timeIso: '2026-07-16T18:00:00.000Z', slotId: 'morning', value: 200 },
    ]);

    // Comportamiento correcto: la última lectura (200)
    // Comportamiento actual (bug): la primera que .find() encuentra (100)
    // Este test ASSERT el comportamiento correcto. Si falla, confirma el bug.
    expect(service.getGlucose(today, 'morning')).toBe(200);
  });

  /* ============================================================
   *  11. notifyNativeOncePerDay — no duplica la misma basal el mismo día
   * ============================================================ */
  it('notifyNativeOncePerDay: la segunda llamada el mismo día no vuelve a programar la notificación', async () => {
    // Simulamos plataforma nativa mutando window.Capacitor directamente
    // (en jsdom, globalThis.window es getter y no se puede reasignar).
    const originalCapacitor = (window as any).Capacitor;
    (window as any).Capacitor = { isNativePlatform: () => true };

    try {
      const slot = service.slots()[0];
      const today = toYmdLocal();

      // Primera llamada: programa
      await (service as any).notifyNativeOncePerDay(today, slot);
      expect(mockSchedule).toHaveBeenCalledTimes(1);
      expect(mockStore[`missed_${today}_${slot.id}`]).toBe('1');

      // Segunda llamada mismo día: NO vuelve a programar
      await (service as any).notifyNativeOncePerDay(today, slot);
      expect(mockSchedule).toHaveBeenCalledTimes(1);
    } finally {
      // Restauramos window.Capacitor
      if (originalCapacitor === undefined) {
        delete (window as any).Capacitor;
      } else {
        (window as any).Capacitor = originalCapacitor;
      }
    }
  });
});
