import { Component, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';

import { InsulinStore } from '../../service/insulin.store';
import { DaySummary } from '../../service/day-summary';
import { SlotConfig } from '../../models/models';
import { Router, RouterModule } from '@angular/router';
import { CompletionRingComponent } from './completion-ring/completion-ring.component';
import { SummaryChipsComponent } from './summary-chips/summary-chips.component';
import { SlotCardComponent } from './slot-card/slot-card.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    RouterModule,
    CompletionRingComponent,
    SummaryChipsComponent,
    SlotCardComponent,
  ],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage {
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

  // Signal-bound getters (API para el template)
  get slots() { return this.store.slots(); }
  get today() { return this.store.today(); }
  get daySummary() { return this.summary.daySummary(); }
  get missed() { return this.summary.missedBasalSlots(); }

  /* =======================
   *  Acciones de la franja (delegan al store)
   *  El componente <app-slot-card> emite el evento sin saber el
   *  contexto; este handler lo conecta con la franja concreta.
   * ======================= */
  onToggleBasal(s: SlotConfig) { this.store.toggleBasal(s.id); }
  onAddBolus(s: SlotConfig, units: number) { this.store.addBolus(s.id, units); }
  onRemoveLastBolus(s: SlotConfig) { this.store.removeLastBolus(s.id); }
  onAddNote(s: SlotConfig, text: string) { this.store.addNote(s.id, text); }

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
