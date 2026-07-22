import { Injectable, signal } from '@angular/core';
import { DoseEntry, GlucoseEntry, NoteEntry, SlotConfig } from '../models/models';
import { toYmdLocal, minutesNowLocal } from '../utils/date-utils';
import { Preferences } from '@capacitor/preferences';

import { INSULIN_CATALOG } from './insulin-catalog';
import { InsulinProfile, SlotOverride } from '../models/profile';
import { InsulinBrand } from '../models/insulin';
import { buildSlotsFromBrands, validateSlotOverrides } from '../utils/slot-rules';

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

/**
 * Capa de datos. Único servicio que toca Capacitor Preferences.
 * - Mantiene los signals con entries/glucose/notes/profile/slots/today/nowMin.
 * - Expone los signals en modo solo-lectura.
 * - Todas las mutaciones persisten en storage.
 *
 * Lo que NO hace:
 * - No computa resúmenes del día (eso es DaySummary).
 * - No programa notificaciones (eso es Notifications).
 */
@Injectable({ providedIn: 'root' })
export class InsulinStore {
  // --- private mutable state ---
  private _slots = signal<SlotConfig[]>(DEFAULT_SLOTS);
  private _today = signal<string>(toYmdLocal());
  private _nowMin = signal<number>(minutesNowLocal());
  private _profile = signal<InsulinProfile | null>(null);
  private _entries = signal<DoseEntry[]>([]);
  private _glucoseEntries = signal<GlucoseEntry[]>([]);
  private _noteEntries = signal<NoteEntry[]>([]);

  // --- public read-only signals ---
  readonly slots = this._slots.asReadonly();
  readonly today = this._today.asReadonly();
  readonly nowMin = this._nowMin.asReadonly();
  readonly profile = this._profile.asReadonly();
  readonly entries = this._entries.asReadonly();
  readonly glucoseEntries = this._glucoseEntries.asReadonly();
  readonly noteEntries = this._noteEntries.asReadonly();

  constructor() {
    this.loadFromStorage();
    setInterval(() => this.tick(), 60_000);
  }

  /* =======================
   *  VALIDACIÓN
   * ======================= */
  /**
   * Lanza Error si la hora es futura. Si no se pasa timeIso,
   * no valida (se usará la hora actual al guardar, que no es futura).
   *
   * Defensa contra datos incorrectos: en una app de salud, un registro
   * con hora futura falsea el "última basal" y rompe las notificaciones
   * de basales perdidas. La UI también intenta evitarlo (ion-datetime
   * con [max]="now"), pero el store es la última línea de defensa.
   */
  private assertNotFuture(timeIso: string | undefined): void {
    if (!timeIso) return;
    if (new Date(timeIso).getTime() > Date.now()) {
      throw new Error(`No se permite registrar una hora futura: ${timeIso}`);
    }
  }

  /* =======================
   *  PERFIL / CATÁLOGO
   * ======================= */
  getCatalog(): InsulinBrand[] { return INSULIN_CATALOG; }
  hasProfile(): boolean { return !!this._profile()?.brandIds?.length; }

  /**
   * Persiste el perfil del usuario (marcas elegidas + overrides de horarios)
   * y re-deriva los slots a partir de las marcas + los overrides.
   *
   * Valida los overrides antes de persistir: si algo no cuadra, lanza
   * Error y NO toca storage ni signals. Esto evita que un backup corrupto
   * o un input manipulado rompa la UI.
   *
   * @param brandIds IDs de las marcas elegidas (puede ser [] para vaciar)
   * @param slotOverrides Overrides opcionales por slotId. Si no se pasan
   *   (o se pasa undefined), el profile queda sin overrides.
   */
  async setProfileByIds(brandIds: string[], slotOverrides?: Record<string, SlotOverride>) {
    const brands = INSULIN_CATALOG.filter(b => brandIds.includes(b.id));

    // Validamos los overrides CONTRA los slots por defecto (sin overrides),
    // porque validateSlotOverrides necesita los defaults como referencia.
    const defaultSlots = buildSlotsFromBrands(brands);
    validateSlotOverrides(slotOverrides, defaultSlots);

    this._profile.set({ brandIds, slotOverrides });
    await Preferences.set({ key: PROFILE_KEY, value: JSON.stringify(this._profile()) });
    this.applyProfileToSlots();
  }

  private applyProfileToSlots() {
    const profile = this._profile();
    if (!profile) return;
    const brands = INSULIN_CATALOG.filter(b => profile.brandIds.includes(b.id));
    this._slots.set(buildSlotsFromBrands(brands, profile.slotOverrides));
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

  /* =======================
   *  API — queries
   * ======================= */
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

  getGlucose(dateYmd: string, slotId: string): number | null {
    // Devuelve la lectura MÁS RECIENTE del slot (sort por timeIso desc).
    const entries = this._glucoseEntries()
      .filter(g => g.dateYmd === dateYmd && g.slotId === slotId)
      .sort((a, b) => b.timeIso.localeCompare(a.timeIso));
    return entries[0]?.value ?? null;
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

  /* =======================
   *  API — mutations
   * ======================= */
  toggleBasal(slotId: string, timeIso?: string) {
    this.assertNotFuture(timeIso);
    const dateYmd = this._today();
    const time = timeIso ?? new Date().toISOString();
    this._entries.update(entries => {
      const idx = entries.findIndex(e =>
        e.dateYmd === dateYmd && e.slotId === slotId && e.type === 'basal'
      );
      if (idx >= 0) {
        return [...entries.slice(0, idx), ...entries.slice(idx + 1)];
      }
      return [...entries, { dateYmd, timeIso: time, slotId, type: 'basal', units: 1 }];
    });
    this.saveToStorage();
  }

  addBolus(slotId: string, units: number, timeIso?: string) {
    this.assertNotFuture(timeIso);
    if (!units || units <= 0) return;
    if (units < BOLUS_MIN || units > BOLUS_MAX) return;
    const dateYmd = this._today();
    const time = timeIso ?? new Date().toISOString();
    this._entries.update(entries => [
      ...entries,
      { dateYmd, timeIso: time, slotId, type: 'bolus', units }
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

  setGlucose(slotId: string, value: number, timeIso?: string) {
    this.assertNotFuture(timeIso);
    const dateYmd = this._today();
    const time = timeIso ?? new Date().toISOString();
    this._glucoseEntries.update(entries => {
      const idx = entries.findIndex(g => g.dateYmd === dateYmd && g.slotId === slotId);

      if (value <= 0 || isNaN(value)) {
        if (idx >= 0) return [...entries.slice(0, idx), ...entries.slice(idx + 1)];
        return entries;
      }
      if (value < GLUCOSE_MIN || value > GLUCOSE_MAX) return entries;

      if (idx >= 0) {
        const next = [...entries];
        next[idx] = { ...next[idx], value, timeIso: time };
        return next;
      }
      return [...entries, { dateYmd, timeIso: time, slotId, value }];
    });
    this.saveToStorage();
  }

  addNote(slotId: string, text: string, timeIso?: string) {
    this.assertNotFuture(timeIso);
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    const dateYmd = this._today();
    const time = timeIso ?? new Date().toISOString();
    this._noteEntries.update(notes => [
      ...notes,
      { dateYmd, timeIso: time, slotId, text: trimmed }
    ]);
    this.saveToStorage();
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

  /**
   * Cambia el `timeIso` de la basal del slot de hoy.
   * No hace nada si no hay basal registrada.
   * Usado por la UI cuando el usuario edita la hora de una basal
   * ya marcada (típicamente porque se inyectó antes y la marcó tarde).
   */
  updateBasalTime(slotId: string, newTimeIso: string) {
    this.assertNotFuture(newTimeIso);
    const dateYmd = this._today();
    this._entries.update(entries => {
      const idx = entries.findIndex(
        e => e.dateYmd === dateYmd && e.slotId === slotId && e.type === 'basal'
      );
      if (idx < 0) return entries;
      const next = [...entries];
      next[idx] = { ...next[idx], timeIso: newTimeIso };
      return next;
    });
    this.saveToStorage();
  }

  /**
   * Cambia el `timeIso` de un bolus específico del slot, identificado
   * por su `oldTimeIso`. Usado por la UI cuando el usuario edita la
   * hora de un bolus concreto desde la lista.
   *
   * No hace nada si no se encuentra un bolus con ese timeIso
   * (mismo slot, mismo día).
   */
  updateBolusTimeByTimestamp(slotId: string, oldTimeIso: string, newTimeIso: string) {
    this.assertNotFuture(newTimeIso);
    const dateYmd = this._today();
    this._entries.update(entries => {
      const idx = entries.findIndex(
        e => e.dateYmd === dateYmd
          && e.slotId === slotId
          && e.type === 'bolus'
          && e.timeIso === oldTimeIso
      );
      if (idx < 0) return entries;
      const next = [...entries];
      next[idx] = { ...next[idx], timeIso: newTimeIso };
      return next;
    });
    this.saveToStorage();
  }

  /**
   * Cambia el `timeIso` de la glucosa del slot de hoy.
   * No hace nada si no hay glucosa registrada.
   */
  updateGlucoseTime(slotId: string, newTimeIso: string) {
    this.assertNotFuture(newTimeIso);
    const dateYmd = this._today();
    this._glucoseEntries.update(entries => {
      const idx = entries.findIndex(g => g.dateYmd === dateYmd && g.slotId === slotId);
      if (idx < 0) return entries;
      const next = [...entries];
      next[idx] = { ...next[idx], timeIso: newTimeIso };
      return next;
    });
    this.saveToStorage();
  }

  /**
   * Cambia el `timeIso` de una nota específica del slot, identificada
   * por su `oldTimeIso`. Usado por la UI cuando el usuario edita la
   * hora de una nota concreta desde la lista.
   *
   * No hace nada si no se encuentra una nota con ese timeIso
   * (mismo slot, mismo día).
   */
  updateNoteTimeByTimestamp(slotId: string, oldTimeIso: string, newTimeIso: string) {
    this.assertNotFuture(newTimeIso);
    const dateYmd = this._today();
    this._noteEntries.update(notes => {
      const idx = notes.findIndex(
        n => n.dateYmd === dateYmd
          && n.slotId === slotId
          && n.timeIso === oldTimeIso
      );
      if (idx < 0) return notes;
      const next = [...notes];
      next[idx] = { ...next[idx], timeIso: newTimeIso };
      return next;
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

  /* =======================
   *  BACKUP / RESTORE
   * ======================= */
  /**
   * Devuelve una snapshot del estado actual lista para serializar
   * a JSON. NO incluye `version` ni `exportedAt`: eso lo añade
   * `serializeBackup` en utils/backup.ts.
   *
   * Importante: hace clones de los arrays para que mutaciones
   * posteriores al export no afecten al backup.
   */
  exportAll(): {
    profile: InsulinProfile | null;
    entries: DoseEntry[];
    glucoseEntries: GlucoseEntry[];
    noteEntries: NoteEntry[];
  } {
    return {
      profile: this._profile() ? { brandIds: [...this._profile()!.brandIds] } : null,
      entries: this._entries().map(e => ({ ...e })),
      glucoseEntries: this._glucoseEntries().map(g => ({ ...g })),
      noteEntries: this._noteEntries().map(n => ({ ...n })),
    };
  }

  /**
   * Reemplaza TODO el estado del store con los datos del backup.
   * Borra lo anterior (entries, glucose, notes, profile) y carga
   * lo nuevo, luego persiste en storage.
   *
   * El `today` y `nowMin` NO se tocan (son del momento presente,
   * no del backup).
   *
   * NO valida el backup: eso va en la capa de UI
   * (`parseAndValidateBackup` en utils/backup.ts).
   */
  async replaceAll(data: {
    profile: InsulinProfile | null;
    entries: DoseEntry[];
    glucoseEntries: GlucoseEntry[];
    noteEntries: NoteEntry[];
  }): Promise<void> {
    this._profile.set(data.profile);
    this._entries.set([...data.entries]);
    this._glucoseEntries.set([...data.glucoseEntries]);
    this._noteEntries.set([...data.noteEntries]);

    // Re-derivamos los slots del perfil (si hay)
    if (data.profile) {
      this.applyProfileToSlots();
    }

    await this.saveToStorage();
  }
}
