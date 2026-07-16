import { Component, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { InsulinStore } from '../../../service/insulin.store';
import { SlotConfig } from '../../../models/models';
import { formatRelativeTime } from '../../../utils/date-utils';
import {
  iconForSlot,
  timeRangeForSlot,
  glucoseClassFor,
  bolusPillsFor,
  bolusOverflowFor,
  trimNoteText,
} from './slot-card.helpers';

/**
 * Tarjeta de una franja de insulina (mañana, tarde, noche, etc.).
 *
 * Componente "smart-light": recibe solo `slot`, `today` e `isMissed`
 * como inputs, y consulta el InsulinStore por su cuenta para basal
 * hecha, suma de bolus, glucosa, notas y últimas marcas. Emite
 * eventos cuando el usuario interactúa — el padre (HomePage) decide
 * qué hacer (llamar al store, mostrar alerts, etc.).
 *
 * La lógica pura (mapeo de icono, formateo de rango, clases de
 * glucosa, pills de bolus, trim de notas) vive en slot-card.helpers.ts
 * para poder testearla sin cargar Stencil/Ionic en jsdom.
 */
@Component({
  selector: 'app-slot-card',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './slot-card.component.html',
  styleUrls: ['./slot-card.component.scss'],
})
export class SlotCardComponent {
  private store = inject(InsulinStore);

  slot = input.required<SlotConfig>();
  today = input.required<string>();
  isMissed = input<boolean>(false);

  toggleBasal = output<void>();
  addBolus = output<number>();
  removeLastBolus = output<void>();
  addNote = output<string>(); // texto ya trimmeado; vacío no se emite
  reset = output<void>();

  quicks = [1, 2, 5];

  // ===== Getters que delegan al store =====

  get basalDone(): boolean {
    return this.store.basalDone(this.today(), this.slot().id);
  }

  get bolusSum(): number {
    return this.store.bolusSum(this.today(), this.slot().id);
  }

  get glucose(): number | null {
    return this.store.getGlucose(this.today(), this.slot().id);
  }

  get notes() {
    return this.store.getNotesFor(this.today(), this.slot().id);
  }

  get lastBasalTime(): string | null {
    return this.store.getLastEntryTime(this.today(), this.slot().id, 'basal');
  }

  get lastBolusTime(): string | null {
    return this.store.getLastEntryTime(this.today(), this.slot().id, 'bolus');
  }

  // ===== Wrappers de helpers puros =====

  get timeRange(): string {
    return timeRangeForSlot(this.slot());
  }

  get icon(): string {
    return iconForSlot(this.slot().id);
  }

  glucoseClass(value: number | null): string {
    return glucoseClassFor(value);
  }

  bolusArray(): number[] {
    return bolusPillsFor(this.bolusSum);
  }

  bolusOverflow(): number {
    return bolusOverflowFor(this.bolusSum);
  }

  relTime(iso: string | null): string {
    return formatRelativeTime(iso);
  }

  // ===== Handlers de eventos del template =====

  onToggleBasal() { this.toggleBasal.emit(); }
  onAddBolus(units: number) { this.addBolus.emit(units); }
  onRemoveLastBolus() { this.removeLastBolus.emit(); }
  onReset() { this.reset.emit(); }

  /**
   * Se llama en (ionBlur) en vez de (ionChange) para no escribir
   * a storage con cada pulsación. Number('') === 0 → borra la
   * lectura (consistente con el servicio).
   */
  onGlucoseBlur(ev: { detail: { value: string | number | null } }) {
    const raw = ev.detail.value;
    const value = typeof raw === 'number' ? raw : Number(raw);
    this.store.setGlucose(this.slot().id, value);
  }

  onAddNoteFromInput(text: string, target: HTMLIonInputElement | HTMLInputElement) {
    const trimmed = trimNoteText(text);
    if (!trimmed) return;
    this.addNote.emit(trimmed);
    // Limpiamos el input después de emitir
    if (target && 'value' in target) target.value = '';
  }
}
