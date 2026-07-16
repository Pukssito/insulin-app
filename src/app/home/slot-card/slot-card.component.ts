import { Component, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, PopoverController, ToastController } from '@ionic/angular';

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
import { TimePickerPopoverComponent } from '../time-picker-popover/time-picker-popover.component';

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
  private popoverCtrl = inject(PopoverController);
  private toast = inject(ToastController);

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

  /**
   * Hora de la última lectura de glucosa del slot (o null si no hay).
   * Usado por la template para mostrar "120 mg/dL · hace X min" con su ✎.
   */
  get glucoseTime(): string | null {
    if (this.glucose === null) return null;
    const today = this.today();
    const entry = this.store.glucoseEntries().find(
      g => g.dateYmd === today && g.slotId === this.slot().id
    );
    return entry?.timeIso ?? null;
  }

  /**
   * Lista de boluses del slot, ordenados por hora ascendente.
   * Cada entry tiene su ✎ en la template para editar su hora individualmente.
   */
  get bolusEntries() {
    const today = this.today();
    return this.store.entries()
      .filter(e => e.dateYmd === today && e.slotId === this.slot().id && e.type === 'bolus')
      .sort((a, b) => a.timeIso.localeCompare(b.timeIso));
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

  /**
   * Abre un popover para editar la hora de la basal registrada.
   * Al confirmar, llama al store con la nueva hora.
   */
  async onEditBasalTime() {
    if (!this.basalDone) return;
    const popover = await this.popoverCtrl.create({
      component: TimePickerPopoverComponent,
      componentProps: {
        title: 'Cambiar hora de la basal',
        defaultTime: this.lastBasalTime || new Date().toISOString(),
      },
      cssClass: 'time-picker-popover-wrapper',
    });
    await popover.present();
    const { data } = await popover.onDidDismiss();
    if (data?.timeIso) {
      try {
        this.store.updateBasalTime(this.slot().id, data.timeIso);
      } catch (err: any) {
        await this.presentError(err?.message ?? 'No se pudo guardar la hora');
      }
    }
  }

  /**
   * Abre un popover para editar la hora de un bolus concreto,
   * identificado por su `oldTimeIso` actual.
   */
  async onEditSpecificBolusTime(oldTimeIso: string) {
    const popover = await this.popoverCtrl.create({
      component: TimePickerPopoverComponent,
      componentProps: {
        title: 'Cambiar hora del bolus',
        defaultTime: oldTimeIso,
      },
      cssClass: 'time-picker-popover-wrapper',
    });
    await popover.present();
    const { data } = await popover.onDidDismiss();
    if (data?.timeIso) {
      try {
        this.store.updateBolusTimeByTimestamp(
          this.slot().id,
          oldTimeIso,
          data.timeIso
        );
      } catch (err: any) {
        await this.presentError(err?.message ?? 'No se pudo guardar la hora');
      }
    }
  }

  /**
   * Abre un popover para editar la hora de la lectura de glucosa del slot.
   */
  async onEditGlucoseTime() {
    if (this.glucose === null) return;
    const popover = await this.popoverCtrl.create({
      component: TimePickerPopoverComponent,
      componentProps: {
        title: 'Cambiar hora de la glucosa',
        defaultTime: this.glucoseTime || new Date().toISOString(),
      },
      cssClass: 'time-picker-popover-wrapper',
    });
    await popover.present();
    const { data } = await popover.onDidDismiss();
    if (data?.timeIso) {
      try {
        this.store.updateGlucoseTime(this.slot().id, data.timeIso);
      } catch (err: any) {
        await this.presentError(err?.message ?? 'No se pudo guardar la hora');
      }
    }
  }

  /**
   * Abre un popover para editar la hora de una nota concreta,
   * identificada por su `oldTimeIso` actual.
   */
  async onEditNoteTime(oldTimeIso: string) {
    const popover = await this.popoverCtrl.create({
      component: TimePickerPopoverComponent,
      componentProps: {
        title: 'Cambiar hora de la nota',
        defaultTime: oldTimeIso,
      },
      cssClass: 'time-picker-popover-wrapper',
    });
    await popover.present();
    const { data } = await popover.onDidDismiss();
    if (data?.timeIso) {
      try {
        this.store.updateLastNoteTime(this.slot().id, data.timeIso);
      } catch (err: any) {
        await this.presentError(err?.message ?? 'No se pudo guardar la hora');
      }
    }
  }

  /**
   * Muestra un toast de error en la parte superior. Se usa cuando el
   * store rechaza una operación (ej. hora futura) para que el usuario
   * sepa que su cambio no se guardó.
   */
  private async presentError(message: string) {
    const t = await this.toast.create({
      message,
      duration: 3000,
      position: 'top',
      color: 'danger',
    });
    await t.present();
  }
}
