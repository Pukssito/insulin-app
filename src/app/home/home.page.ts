import { Component, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';

import { InsulinService } from '../../service/insulin.service';
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
    public svc: InsulinService,
    private toast: ToastController,
    private alert: AlertController,
    private router: Router
  ) {
    if (!this.svc.hasProfile()) {
      setTimeout(() => this.router.navigateByUrl('/setup'), 0);
    }

    // Toast when a new basal is missed
    effect(() => {
      const ids = this.svc.missedBasalSlots();
      for (const id of ids) {
        if (!this.prevMissed.has(id)) {
          const label = this.svc.slots().find(s => s.id === id)?.label || id;
          this.presentToast(`⚠ Dosis basal olvidada en ${label}`);
        }
      }
      this.prevMissed = new Set(ids);
    });
  }

  // Signal-bound getters (keep template API stable)
  get slots() { return this.svc.slots(); }
  get today() { return this.svc.today(); }
  get daySummary() { return this.svc.daySummary(); }
  get missed() { return this.svc.missedBasalSlots(); }

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

  basalDone(s: SlotConfig) { return this.svc.basalDone(this.today, s.id); }
  bolusSum(s: SlotConfig) { return this.svc.bolusSum(this.today, s.id); }

  toggleBasal(s: SlotConfig) { this.svc.toggleBasal(s.id); }
  addBolus(s: SlotConfig, u: number) { this.svc.addBolus(s.id, u); }
  removeLastBolus(s: SlotConfig) { this.svc.removeLastBolus(s.id); }

  addComment(s: SlotConfig, text: string) {
    if (!text?.trim()) return;
    this.svc.addNote(s.id, text);
  }

  async confirmResetSlot(s: SlotConfig) {
    const a = await this.alert.create({
      header: 'Reiniciar franja',
      message: `Vas a borrar basal, bolus, glucosa y notas de ${s.label} de hoy. ¿Continuar?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Borrar', role: 'destructive', handler: () => this.svc.resetSlotToday(s.id) }
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
        { text: 'Borrar todo', role: 'destructive', handler: () => this.svc.resetAllToday() }
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
    return this.svc.getLastEntryTime(this.today, s.id, 'basal');
  }

  lastBolusTime(s: SlotConfig): string | null {
    return this.svc.getLastEntryTime(this.today, s.id, 'bolus');
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
