import { Injectable, effect } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { LocalNotifications } from '@capacitor/local-notifications';

import { InsulinStore } from './insulin.store';
import { DaySummary } from './day-summary';
import { SlotConfig } from '../models/models';

/**
 * Capa de notificaciones nativas.
 * - NO pide permiso en el constructor: el componente debe llamar
 *   `requestPermission()` cuando el usuario lo autorice.
 * - Programa una notificación por cada basal perdida, deduplicada
 *   por (día, slotId) usando Preferences como marca.
 *
 * Conoce a: InsulinStore (datos), DaySummary (basales perdidas).
 * Lo conocen: el componente que pida permiso (Setup, Home).
 */
@Injectable({ providedIn: 'root' })
export class Notifications {
  constructor(private store: InsulinStore, private daySummary: DaySummary) {
    effect(() => {
      const today = this.store.today();
      const missed = this.daySummary.missedBasalSlots();
      for (const slotId of missed) {
        const slot = this.store.slots().find(s => s.id === slotId);
        if (slot) this.notifyNativeOncePerDay(today, slot);
      }
    });
  }

  /**
   * Pide permiso de notificaciones si aún no está concedido.
   * El componente decide CUÁNDO llamarlo (no en el constructor
   * de la app, para no asustar al usuario antes de tiempo).
   */
  async requestPermission(): Promise<void> {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      await LocalNotifications.requestPermissions();
    }
  }

  /**
   * Programa una notificación nativa para (dateYmd, slot.id) si
   * no se ha programado ya hoy. Usa Preferences como marca de
   * dedup para no spamear al usuario.
   *
   * Privada porque el flujo público es vía el `effect` reactivo
   * que reacciona a cambios en `missedBasalSlots`.
   */
  private async notifyNativeOncePerDay(dateYmd: string, slot: SlotConfig) {
    const key = `missed_${dateYmd}_${slot.id}`;
    const { value } = await Preferences.get({ key });
    if (value === '1') return;

    if ((window as any).Capacitor?.isNativePlatform?.()) {
      const idNum = Number(
        `${dateYmd.replace(/-/g, '')}${this.store.slots().findIndex(s => s.id === slot.id)}`.slice(-6)
      );
      await LocalNotifications.schedule({
        notifications: [{
          id: idNum,
          title: 'Dosis basal pendiente',
          body: `Parece que olvidaste la basal en ${slot.label}.`,
          schedule: { at: new Date(Date.now() + 500) }
        }]
      });
      await Preferences.set({ key, value: '1' });
    }
  }
}
