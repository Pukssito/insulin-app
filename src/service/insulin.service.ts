import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DoseEntry, SlotConfig } from '../models/models';
import { toYmdLocal, minutesNowLocal } from '../utils/date-utils';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';

// ⬇️ PERFIL/CATÁLOGO/REGLAS
import { INSULIN_CATALOG } from '../service/insulin-catalog';
import { InsulinProfile } from '../models/profile';
import { InsulinBrand } from '../models/insulin';
import { buildSlotsFromBrands } from '../utils/slot-rules';

const ENTRIES_KEY = 'insulin_entries_v1';
const PROFILE_KEY = 'insulin_profile_v1';

@Injectable({ providedIn: 'root' })
export class InsulinService {
  readonly slots$ = new BehaviorSubject<SlotConfig[]>([
    { id: 'morning',   label: 'Mañana',   startMin: 6*60,  endMin: 12*60,   kind: 'both' },
    { id: 'afternoon', label: 'Tarde',    startMin: 12*60, endMin: 18*60,   kind: 'both' },
    { id: 'night',     label: 'Noche',    startMin: 18*60, endMin: 24*60-1, kind: 'both' },
  ]);

  private entries: DoseEntry[] = [];
  private profile: InsulinProfile | null = null;     // ⬅️ perfil

  readonly today$ = new BehaviorSubject<string>(toYmdLocal());
  readonly missedBasalSlots$ = new BehaviorSubject<string[]>([]);

  constructor() {
    this.loadFromStorage().then(() => this.recomputeMissed());
    setInterval(() => this.tick(), 60_000);
    this.ensureNotifPermission();
  }

  /* =======================
   *  PERFIL / CATÁLOGO
   * ======================= */
  getCatalog(): InsulinBrand[] { return INSULIN_CATALOG; }
  hasProfile(): boolean { return !!this.profile?.brandIds?.length; }

  async setProfileByIds(brandIds: string[]) {
    this.profile = { brandIds };
    await Preferences.set({ key: PROFILE_KEY, value: JSON.stringify(this.profile) });
    this.applyProfileToSlots();
  }

  private applyProfileToSlots() {
    if (!this.profile) return;
    const brands = INSULIN_CATALOG.filter(b => this.profile!.brandIds.includes(b.id));
    const slots = buildSlotsFromBrands(brands);
    this.slots$.next(slots);
  }

  /* =======================
   *  STORAGE
   * ======================= */
  private async loadFromStorage() {
    const [{ value: entriesJson }, { value: profileJson }] = await Promise.all([
      Preferences.get({ key: ENTRIES_KEY }),
      Preferences.get({ key: PROFILE_KEY }),
    ]);

    if (entriesJson) {
      try { this.entries = JSON.parse(entriesJson); } catch { this.entries = []; }
    }
    if (profileJson) {
      try { this.profile = JSON.parse(profileJson); this.applyProfileToSlots(); } catch {}
    }
    this.today$.next(toYmdLocal());
  }

  private async saveToStorage() {
    await Preferences.set({ key: ENTRIES_KEY, value: JSON.stringify(this.entries) });
  }

  /* =======================
   *  TICK / NOTIFICACIONES
   * ======================= */
  private tick() {
    const nowYmd = toYmdLocal();
    if (nowYmd !== this.today$.value) {
      this.entries = [];
      this.today$.next(nowYmd);
      this.saveToStorage();
    }
    this.recomputeMissed();
  }

  private async ensureNotifPermission() {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      await LocalNotifications.requestPermissions();
    }
  }

  async recomputeMissed(forceTest = false) {
    const today = toYmdLocal();
    const nowMin = minutesNowLocal();
    const missed: string[] = [];

    for (const slot of this.slots$.value) {
      const slotIsPast = forceTest || (nowMin >= slot.endMin);
      const needsBasal = slot.kind === 'basal' || slot.kind === 'both';
      if (!slotIsPast || !needsBasal) continue;

      const done = this.entries.some(
        e => e.dateYmd === today && e.slotId === slot.id && e.type === 'basal'
      );
      if (!done) {
        missed.push(slot.id);
        await this.notifyNativeOncePerDay(today, slot);
      }
    }
    this.missedBasalSlots$.next(missed);
  }

  private async notifyNativeOncePerDay(dateYmd: string, slot: SlotConfig) {
    const key = `missed_${dateYmd}_${slot.id}`; // ⬅️ usa backticks
    const { value } = await Preferences.get({ key });
    if (value === '1') return;

    if ((window as any).Capacitor?.isNativePlatform?.()) {
      const idNum = Number(
        `${dateYmd.replace(/-/g, '')}${this.slots$.value.findIndex(s => s.id === slot.id)}`.slice(-6)
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
   *  API EXISTENTE
   * ======================= */
  currentSlotId(slots: SlotConfig[], d = new Date()): string | null {
    const m = minutesNowLocal(d);
    const s = slots.find(s => s.startMin <= s.endMin
      ? m >= s.startMin && m < s.endMin
      : (m >= s.startMin || m < s.endMin));
    return s?.id ?? null;
  }

  getEntriesFor(dateYmd: string, slotId: string) {
    return this.entries.filter(e => e.dateYmd === dateYmd && e.slotId === slotId);
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
    const dateYmd = toYmdLocal();
    const idx = this.entries.findIndex(e =>
      e.dateYmd === dateYmd && e.slotId === slotId && e.type === 'basal'
    );
    if (idx >= 0) this.entries.splice(idx, 1);
    else this.entries.push({ dateYmd, timeIso: new Date().toISOString(), slotId, type: 'basal', units: 1 });

    this.today$.next(dateYmd);
    this.saveToStorage();
    this.recomputeMissed();
  }

  addBolus(slotId: string, units: number) {
    if (!units || units <= 0) return;
    const dateYmd = toYmdLocal();
    this.entries.push({ dateYmd, timeIso: new Date().toISOString(), slotId, type: 'bolus', units });

    this.today$.next(dateYmd);
    this.saveToStorage();
    this.recomputeMissed();
  }

  resetSlotToday(slotId: string) {
    const today = toYmdLocal();
    this.entries = this.entries.filter(e => !(e.dateYmd === today && e.slotId === slotId));

    this.today$.next(today);
    this.saveToStorage();
    this.recomputeMissed();
  }

  resetAllToday() {
    const today = toYmdLocal();
    this.entries = this.entries.filter(e => e.dateYmd !== today);

    this.today$.next(today);
    this.saveToStorage();
    this.recomputeMissed();
  }

  undoLast(slotId?: string) {
    const dateYmd = toYmdLocal();
    const idx = [...this.entries]
      .map((e, i) => ({ e, i }))
      .filter(x => x.e.dateYmd === dateYmd && (!slotId || x.e.slotId === slotId))
      .map(x => x.i)
      .pop();
    if (idx !== undefined) this.entries.splice(idx, 1);
    this.today$.next(dateYmd);
  }
}
