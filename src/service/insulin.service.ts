import { Injectable, computed, effect, signal } from '@angular/core';
import { DoseEntry, GlucoseEntry, NoteEntry, SlotConfig } from '../models/models';
import { toYmdLocal, minutesNowLocal } from '../utils/date-utils';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';

import { INSULIN_CATALOG } from '../service/insulin-catalog';
import { InsulinProfile } from '../models/profile';
import { InsulinBrand } from '../models/insulin';
import { buildSlotsFromBrands } from '../utils/slot-rules';

const ENTRIES_KEY = 'insulin_entries_v1';
const GLUCOSE_KEY = 'glucose_entries_v1';
const NOTES_KEY = 'insulin_notes_v1';
const PROFILE_KEY = 'insulin_profile_v1';

const GLUCOSE_MIN = 20;
const GLUCOSE_MAX = 600;
const BOLUS_MIN = 0.5;
const BOLUS_MAX = 50;

const DEFAULT_SLOTS: SlotConfig[] = [
  { id: 'morning',   label: 'Mañana',   startMin: 6 * 60,  endMin: 12 * 60,   kind: 'both' },
  { id: 'afternoon', label: 'Tarde',    startMin: 12 * 60, endMin: 18 * 60,   kind: 'both' },
  { id: 'night',     label: 'Noche',    startMin: 18 * 60, endMin: 24 * 60 - 1, kind: 'both' },
];

@Injectable({ providedIn: 'root' })
export class InsulinService {
  // Private mutable state
  private _slots = signal<SlotConfig[]>(DEFAULT_SLOTS);
  private _today = signal<string>(toYmdLocal());
  private _nowMin = signal<number>(minutesNowLocal());
  private _profile = signal<InsulinProfile | null>(null);
  private _entries = signal<DoseEntry[]>([]);
  private _glucoseEntries = signal<GlucoseEntry[]>([]);
  private _noteEntries = signal<NoteEntry[]>([]);

  // Public read-only signals
  readonly slots = this._slots.asReadonly();
  readonly today = this._today.asReadonly();

  // Computed: missed basal slots
  readonly missedBasalSlots = computed<string[]>(() => {
    const today = this._today();
    const nowMin = this._nowMin();
    const slots = this._slots();
    const entries = this._entries();

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

  // Computed: day summary
  readonly daySummary = computed(() => {
    const today = this._today();
    const slots = this._slots();
    const entries = this._entries();
    const glucose = this._glucoseEntries();

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

  constructor() {
    this.loadFromStorage();
    this.ensureNotifPermission();

    // Side effect: schedule native notifications when missed basal changes
    effect(() => {
      const today = this._today();
      const missed = this.missedBasalSlots();
      for (const slotId of missed) {
        const slot = this._slots().find(s => s.id === slotId);
        if (slot) this.notifyNativeOncePerDay(today, slot);
      }
    });

    setInterval(() => this.tick(), 60_000);
  }

  /* =======================
   *  PERFIL / CATÁLOGO
   * ======================= */
  getCatalog(): InsulinBrand[] { return INSULIN_CATALOG; }
  hasProfile(): boolean { return !!this._profile()?.brandIds?.length; }

  async setProfileByIds(brandIds: string[]) {
    this._profile.set({ brandIds });
    await Preferences.set({ key: PROFILE_KEY, value: JSON.stringify(this._profile()) });
    this.applyProfileToSlots();
  }

  private applyProfileToSlots() {
    const profile = this._profile();
    if (!profile) return;
    const brands = INSULIN_CATALOG.filter(b => profile.brandIds.includes(b.id));
    this._slots.set(buildSlotsFromBrands(brands));
  }

  /* =======================
   *  STORAGE
   * ======================= */
  private async loadFromStorage() {
    const [entriesR, glucoseR, notesR, profileR] = await Promise.all([
      Preferences.get({ key: ENTRIES_KEY }),
      Preferences.get({ key: GLUCOSE_KEY }),
      Preferences.get({ key: NOTES_KEY }),
      Preferences.get({ key: PROFILE_KEY }),
    ]);

    if (entriesR.value) {
      try { this._entries.set(JSON.parse(entriesR.value)); } catch { /* keep empty */ }
    }
    if (glucoseR.value) {
      try { this._glucoseEntries.set(JSON.parse(glucoseR.value)); } catch { /* keep empty */ }
    }
    if (notesR.value) {
      try { this._noteEntries.set(JSON.parse(notesR.value)); } catch { /* keep empty */ }
    }
    if (profileR.value) {
      try {
        this._profile.set(JSON.parse(profileR.value));
        this.applyProfileToSlots();
      } catch { /* keep empty */ }
    }
    this._today.set(toYmdLocal());
  }

  private async saveToStorage() {
    await Promise.all([
      Preferences.set({ key: ENTRIES_KEY, value: JSON.stringify(this._entries()) }),
      Preferences.set({ key: GLUCOSE_KEY, value: JSON.stringify(this._glucoseEntries()) }),
      Preferences.set({ key: NOTES_KEY, value: JSON.stringify(this._noteEntries()) }),
    ]);
  }

  /* =======================
   *  TICK
   * ======================= */
  private tick() {
    const nowYmd = toYmdLocal();
    if (nowYmd !== this._today()) {
      this._today.set(nowYmd);
    }
    this._nowMin.set(minutesNowLocal());
  }

  private async ensureNotifPermission() {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      await LocalNotifications.requestPermissions();
    }
  }

  private async notifyNativeOncePerDay(dateYmd: string, slot: SlotConfig) {
    const key = `missed_${dateYmd}_${slot.id}`;
    const { value } = await Preferences.get({ key });
    if (value === '1') return;

    if ((window as any).Capacitor?.isNativePlatform?.()) {
      const idNum = Number(
        `${dateYmd.replace(/-/g, '')}${this._slots().findIndex(s => s.id === slot.id)}`.slice(-6)
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

  /* =======================
   *  API
   * ======================= */
  currentSlotId(slots: SlotConfig[], d = new Date()): string | null {
    const m = minutesNowLocal(d);
    const s = slots.find(s => s.startMin <= s.endMin
      ? m >= s.startMin && m < s.endMin
      : (m >= s.startMin || m < s.endMin));
    return s?.id ?? null;
  }

  getEntriesFor(dateYmd: string, slotId: string): DoseEntry[] {
    return this._entries().filter(e => e.dateYmd === dateYmd && e.slotId === slotId);
  }

  basalDone(dateYmd: string, slotId: string): boolean {
    return this.getEntriesFor(dateYmd, slotId).some(e => e.type === 'basal');
  }

  bolusSum(dateYmd: string, slotId: string): number {
    return this.getEntriesFor(dateYmd, slotId)
      .filter(e => e.type === 'bolus')
      .reduce((s, e) => s + e.units, 0);
  }

  toggleBasal(slotId: string) {
    const dateYmd = this._today();
    this._entries.update(entries => {
      const idx = entries.findIndex(e =>
        e.dateYmd === dateYmd && e.slotId === slotId && e.type === 'basal'
      );
      if (idx >= 0) {
        return [...entries.slice(0, idx), ...entries.slice(idx + 1)];
      }
      return [...entries, { dateYmd, timeIso: new Date().toISOString(), slotId, type: 'basal', units: 1 }];
    });
    this.saveToStorage();
  }

  addBolus(slotId: string, units: number) {
    if (!units || units <= 0) return;
    if (units < BOLUS_MIN || units > BOLUS_MAX) return;
    const dateYmd = this._today();
    this._entries.update(entries => [
      ...entries,
      { dateYmd, timeIso: new Date().toISOString(), slotId, type: 'bolus', units }
    ]);
    this.saveToStorage();
  }

  removeLastBolus(slotId: string) {
    const dateYmd = this._today();
    this._entries.update(entries => {
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e.dateYmd === dateYmd && e.slotId === slotId && e.type === 'bolus') {
          return [...entries.slice(0, i), ...entries.slice(i + 1)];
        }
      }
      return entries;
    });
    this.saveToStorage();
  }

  getGlucose(dateYmd: string, slotId: string): number | null {
    // Devuelve la lectura MÁS RECIENTE del slot (varias inyecciones directas
    // en el signal pueden dejar duplicados; queremos la última por timeIso).
    const entries = this._glucoseEntries()
      .filter(g => g.dateYmd === dateYmd && g.slotId === slotId)
      .sort((a, b) => b.timeIso.localeCompare(a.timeIso));
    return entries[0]?.value ?? null;
  }

  setGlucose(slotId: string, value: number) {
    const dateYmd = this._today();
    this._glucoseEntries.update(entries => {
      const idx = entries.findIndex(g => g.dateYmd === dateYmd && g.slotId === slotId);

      if (value <= 0 || isNaN(value)) {
        if (idx >= 0) return [...entries.slice(0, idx), ...entries.slice(idx + 1)];
        return entries;
      }
      if (value < GLUCOSE_MIN || value > GLUCOSE_MAX) return entries;

      if (idx >= 0) {
        const next = [...entries];
        next[idx] = { ...next[idx], value, timeIso: new Date().toISOString() };
        return next;
      }
      return [...entries, { dateYmd, timeIso: new Date().toISOString(), slotId, value }];
    });
    this.saveToStorage();
  }

  addNote(slotId: string, text: string) {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    const dateYmd = this._today();
    this._noteEntries.update(notes => [
      ...notes,
      { dateYmd, timeIso: new Date().toISOString(), slotId, text: trimmed }
    ]);
    this.saveToStorage();
  }

  getNotesForDate(dateYmd: string): NoteEntry[] {
    return this._noteEntries()
      .filter(n => n.dateYmd === dateYmd)
      .sort((a, b) => a.timeIso.localeCompare(b.timeIso));
  }

  getNotesFor(dateYmd: string, slotId: string): NoteEntry[] {
    return this._noteEntries()
      .filter(n => n.dateYmd === dateYmd && n.slotId === slotId)
      .sort((a, b) => a.timeIso.localeCompare(b.timeIso));
  }

  getLastEntryTime(dateYmd: string, slotId: string, type: 'basal' | 'bolus'): string | null {
    const entries = this._entries()
      .filter(e => e.dateYmd === dateYmd && e.slotId === slotId && e.type === type)
      .sort((a, b) => b.timeIso.localeCompare(a.timeIso));
    return entries[0]?.timeIso ?? null;
  }

  resetSlotToday(slotId: string) {
    const today = this._today();
    this._entries.update(entries => entries.filter(e => !(e.dateYmd === today && e.slotId === slotId)));
    this._glucoseEntries.update(entries => entries.filter(g => !(g.dateYmd === today && g.slotId === slotId)));
    this._noteEntries.update(notes => notes.filter(n => !(n.dateYmd === today && n.slotId === slotId)));
    this.saveToStorage();
    this._nowMin.set(minutesNowLocal());
  }

  resetAllToday() {
    const today = this._today();
    this._entries.update(entries => entries.filter(e => e.dateYmd !== today));
    this._glucoseEntries.update(entries => entries.filter(g => g.dateYmd !== today));
    this._noteEntries.update(notes => notes.filter(n => n.dateYmd !== today));
    this.saveToStorage();
    this._nowMin.set(minutesNowLocal());
  }

  undoLast(slotId?: string) {
    const dateYmd = this._today();
    this._entries.update(entries => {
      let lastIdx = -1;
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e.dateYmd === dateYmd && (!slotId || e.slotId === slotId)) {
          lastIdx = i;
          break;
        }
      }
      if (lastIdx < 0) return entries;
      return [...entries.slice(0, lastIdx), ...entries.slice(lastIdx + 1)];
    });
    this.saveToStorage();
  }

  /* =======================
   *  HISTORIAL
   * ======================= */
  getHistoryDays(): string[] {
    const dates = new Set([
      ...this._entries().map(e => e.dateYmd),
      ...this._glucoseEntries().map(g => g.dateYmd),
      ...this._noteEntries().map(n => n.dateYmd)
    ]);
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }

  getEntriesForDate(dateYmd: string): DoseEntry[] {
    return this._entries().filter(e => e.dateYmd === dateYmd);
  }

  getGlucoseForDate(dateYmd: string): GlucoseEntry[] {
    return this._glucoseEntries().filter(g => g.dateYmd === dateYmd);
  }
}
