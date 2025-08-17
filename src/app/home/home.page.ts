import { Component, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular'; // ← ToastController

import { InsulinService } from '../../service/insulin.service';
import { SlotConfig } from '../../models/models';
import { formatRange } from '../../utils/date-utils';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage implements OnDestroy {
  slots: SlotConfig[] = [];
  today = '';
  sub = new Subscription();
  quicks = [1,2,5];

  missed: string[] = [];
  private prevMissed = new Set<string>(); // ← para detectar nuevas

  constructor(
    public svc: InsulinService,
    private toast: ToastController,
    private router: Router
  ) {
    this.sub.add(this.svc.slots$.subscribe(s => this.slots = s));
    this.sub.add(this.svc.today$.subscribe(t => this.today = t));

    this.sub.add(this.svc.missedBasalSlots$.subscribe(async (ids) => {
      this.missed = ids;
      for (const id of ids) {
        if (!this.prevMissed.has(id)) {
          const label = this.slots.find(s => s.id === id)?.label || id;
          await this.presentToast(`⚠ Dosis basal olvidada en ${label}`);
        }
      }
      this.prevMissed = new Set(ids);
    }));

    if (!this.svc.hasProfile()) {
      setTimeout(() => this.router.navigateByUrl('/setup'), 0);
    }
  }

  ngOnDestroy() { this.sub.unsubscribe(); }

  range(s: SlotConfig) { return formatRange(s.startMin, s.endMin); }
  basalDone(s: SlotConfig) { return this.svc.basalDone(this.today, s.id); }
  bolusSum(s: SlotConfig) { return this.svc.bolusSum(this.today, s.id); }

  toggleBasal(s: SlotConfig) { this.svc.toggleBasal(s.id); }
  addBolus(s: SlotConfig, u: number) { this.svc.addBolus(s.id, u); }

  resetSlot(s: SlotConfig) { this.svc.resetSlotToday(s.id); }
  resetAll() { this.svc.resetAllToday(); }

  simulate() { this.svc.recomputeMissed(true); } // ← fuerza simulación

  // Toast bonito
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

  // (temporal) stub para que no rompa el input de comentario
  addComment(_s: SlotConfig, _text: string) {}
  
  goSetup() {
  this.router.navigateByUrl('/setup');
}
}
