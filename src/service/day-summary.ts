import { Injectable, computed } from '@angular/core';
import { InsulinStore } from './insulin.store';

export interface DaySummaryData {
  basalExpected: number;
  basalDone: number;
  totalBolus: number;
  avgGlucose: number | null;
}

/**
 * Capa de lectura derivada. NO muta estado, NO toca storage, NO
 * lanza side effects. Todos sus valores son `computed` puros que
 * reaccionan a cambios en el InsulinStore.
 *
 * Conoce a: InsulinStore.
 * Lo conocen: HomePage (resumen del día), Notifications (basales
 * perdidas), HistoryPage (resúmenes por fecha).
 */
@Injectable({ providedIn: 'root' })
export class DaySummary {
  readonly daySummary = computed<DaySummaryData>(() => {
    const today = this.store.today();
    const slots = this.store.slots();
    const entries = this.store.entries();
    const glucose = this.store.glucoseEntries();

    const basalExpected = slots.filter(s => s.kind === 'basal' || s.kind === 'both').length;
    const basalDone = entries.filter(d => d.type === 'basal').length;
    const totalBolus = entries
      .filter(d => d.type === 'bolus')
      .reduce((acc, d) => acc + d.units, 0);
    const avgGlucose = glucose.length > 0
      ? Math.round(glucose.reduce((acc, g) => acc + g.value, 0) / glucose.length)
      : null;

    return { basalExpected, basalDone, totalBolus, avgGlucose };
  });

  readonly missedBasalSlots = computed<string[]>(() => {
    const today = this.store.today();
    const nowMin = this.store.nowMin();
    const slots = this.store.slots();
    const entries = this.store.entries();

    const missed: string[] = [];
    for (const slot of slots) {
      const slotIsPast = nowMin >= slot.endMin;
      const needsBasal = slot.kind === 'basal' || slot.kind === 'both';
      if (!slotIsPast || !needsBasal) continue;
      const done = entries.some(
        e => e.dateYmd === today && e.slotId === slot.id && e.type === 'basal'
      );
      if (!done) missed.push(slot.id);
    }
    return missed;
  });

  constructor(private store: InsulinStore) {}
}
