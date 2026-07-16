import { Component, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';

import { InsulinStore } from '../../service/insulin.store';
import { DaySummary } from '../../service/day-summary';
import { SlotConfig } from '../../models/models';
import { formatRange, formatRelativeTime } from '../../utils/date-utils';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, RouterModule],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage {
  quicks = [1, 2, 5];
  private prevMissed = new Set<string>();

  constructor(
    public store: InsulinStore,
    public summary: DaySummary,
    private toast: ToastController,
    private alert: AlertController,
    private router: Router
  ) {
    if (!this.store.hasProfile()) {
      setTimeout(() => this.router.navigateByUrl('/setup'), 0);
    }

    // Toast cuando aparece una nueva basal olvidada
    effect(() => {
      const ids = this.summary.missedBasalSlots();
      for (const id of ids) {
        if (!this.prevMissed.has(id)) {
          const label = this.store.slots().find(s => s.id === id)?.label || id;
          this.presentToast(`⚠ Dosis basal olvidada en ${label}`);
        }
      }
      this.prevMissed = new Set(ids);
    });
  }

  // Signal-bound getters (mantienen la API del template)
  get slots() { return this.store.slots(); }
  get today() { return this.store.today(); }
  get daySummary() { return this.summary.daySummary(); }
  get missed() { return this.summary.missedBasalSlots(); }

  range(s: SlotConfig) { return formatRange(s.startMin, s.endMin); }

  getSlotIcon(id: string): string {
    if (id.includes('morning')) return '☀';
    if (id.includes('afternoon')) return '⛅';
    if (id.includes('night') || id.includes('evening')) return '☾';
    return '⏱';
  }

  slotLabel(id: string): string {
    return this.slots.find(s => s.id === id)?.label ?? id;
  }

  basalDone(s: SlotConfig) { return this.store.basalDone(this.today, s.id); }
  bolusSum(s: SlotConfig) { return this.store.bolusSum(this.today, s.id); }

  toggleBasal(s: SlotConfig) { this.store.toggleBasal(s.id); }
  addBolus(s: SlotConfig, u: number) { this.store.addBolus(s.id, u); }
  removeLastBolus(s: SlotConfig) { this.store.removeLastBolus(s.id); }

  addComment(s: SlotConfig, text: string) {
    if (!text?.trim()) return;
    this.store.addNote(s.id, text);
  }

  async confirmResetSlot(s: SlotConfig) {
    const a = await this.alert.create({
      header: 'Reiniciar franja',
      message: `Vas a borrar basal, bolus, glucosa y notas de ${s.label} de hoy. ¿Continuar?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Borrar', role: 'destructive', handler: () => this.store.resetSlotToday(s.id) }
      ]
    });
    await a.present();
  }

  async confirmResetAll() {
    const a = await this.alert.create({
      header: 'Borrar todo el día',
      message: 'Vas a borrar todos los registros de hoy (basal, bolus, glucosa y notas). ¿Continuar?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Borrar todo', role: 'destructive', handler: () => this.store.resetAllToday() }
      ]
    });
    await a.present();
  }

  get basalCompletion(): number {
    const s = this.daySummary;
    if (s.basalExpected === 0) return 0;
    return Math.min(s.basalDone / s.basalExpected, 1);
  }

  get ringCircumference(): number {
    return 2 * Math.PI * 22;
  }

  get ringDashoffset(): number {
    return this.ringCircumference * (1 - this.basalCompletion);
  }

  bolusArray(s: SlotConfig): number[] {
    const count = Math.min(this.bolusSum(s), 15);
    return Array.from({ length: count }, (_, i) => i);
  }

  bolusOverflow(s: SlotConfig): number {
    return Math.max(0, this.bolusSum(s) - 15);
  }

  lastBasalTime(s: SlotConfig): string | null {
    return this.store.getLastEntryTime(this.today, s.id, 'basal');
  }

  lastBolusTime(s: SlotConfig): string | null {
    return this.store.getLastEntryTime(this.today, s.id, 'bolus');
  }

  relTime(iso: string | null): string {
    return formatRelativeTime(iso);
  }

  glucoseClass(value: number | null): string {
    if (value == null) return '';
    if (value < 70) return 'glucose-low';
    if (value > 180) return 'glucose-high';
    return 'glucose-normal';
  }

  private async presentToast(message: string) {
    const t = await this.toast.create({
      message,
      duration: 2500,
      position: 'top',
      color: 'warning',
      buttons: [{ icon: 'close', role: 'cancel' }]
    });
    await t.present();
  }

  goSetup() {
    this.router.navigateByUrl('/setup');
  }

  goHistory() {
    this.router.navigateByUrl('/history');
  }
}
