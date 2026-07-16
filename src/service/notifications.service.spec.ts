import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

// Hoisted mock state
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

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: vi.fn(async () => ({ display: 'granted' })),
    requestPermissions: vi.fn(async () => ({ display: 'granted' })),
    schedule: mockSchedule,
  },
}));

import { Notifications } from './notifications.service';
import { InsulinStore } from './insulin.store';
import { DaySummary } from './day-summary';
import { toYmdLocal } from '../utils/date-utils';

const flushMacrotasks = async (ms = 20) => {
  await new Promise(resolve => setTimeout(resolve, ms));
};

describe('Notifications', () => {
  let store: InsulinStore;
  let notifications: Notifications;

  beforeEach(async () => {
    resetMocks();
    TestBed.configureTestingModule({});
    store = TestBed.inject(InsulinStore);
    notifications = TestBed.inject(Notifications);
    // Dejamos que loadFromStorage y la primera pasada del effect terminen
    await flushMacrotasks();
  });

  afterEach(() => {
    delete (window as any).Capacitor;
    TestBed.resetTestingModule();
  });

  /* ============================================================
   *  notifyNativeOncePerDay — dedup
   * ============================================================ */
  it('notifyNativeOncePerDay: la segunda llamada el mismo día no vuelve a programar la notificación', async () => {
    (window as any).Capacitor = { isNativePlatform: () => true };

    const slot = store.slots()[0];
    const today = toYmdLocal();

    // Primera llamada: programa
    await (notifications as any).notifyNativeOncePerDay(today, slot);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockStore[`missed_${today}_${slot.id}`]).toBe('1');

    // Segunda llamada mismo día: NO vuelve a programar
    await (notifications as any).notifyNativeOncePerDay(today, slot);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  /* ============================================================
   *  Effect reactivo — programa cuando aparece una basal perdida
   * ============================================================ */
  it('effect: cuando aparece una basal perdida en el store, programa la notificación', async () => {
    (window as any).Capacitor = { isNativePlatform: () => true };

    // En la construcción del servicio no había missed basal (nowMin era "ahora")
    expect(mockSchedule).not.toHaveBeenCalled();

    // Forzamos el tiempo: después de morning y afternoon, antes de night
    (store as any)._nowMin.set(18 * 60 + 30);

    // Esperamos a que el effect re-ejecute y notifyNativeOncePerDay termine
    await flushMacrotasks();

    // Esperamos 2 llamadas (morning y afternoon, ambas perdidas)
    expect(mockSchedule).toHaveBeenCalledTimes(2);
  });

  /* ============================================================
   *  requestPermission — API smoke
   * ============================================================ */
  it('requestPermission: existe y se puede llamar sin error', async () => {
    await expect(notifications.requestPermission()).resolves.not.toThrow();
  });
});
