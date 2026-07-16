import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, PopoverController } from '@ionic/angular';

/**
 * Popover reutilizable para elegir una hora del día.
 * Usado por <app-slot-card> para editar la hora de una basal
 * o de un bolus ya registrado.
 *
 * Inputs:
 *   - title: encabezado del popover
 *   - defaultTime: hora pre-seleccionada (ISO string)
 *
 * Devuelve vía dismiss({ timeIso: string }) la hora confirmada.
 */
@Component({
  selector: 'app-time-picker-popover',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  template: `
    <div class="time-picker-popover">
      <h3 class="popover-title">{{ title }}</h3>
      <ion-datetime
        [(ngModel)]="selectedTime"
        presentation="time"
        [showDefaultButtons]="false"
        [minuteValues]="[0,5,10,15,20,25,30,35,40,45,50,55]"
        size="cover"></ion-datetime>
      <div class="popover-actions">
        <ion-button fill="clear" size="small" (click)="cancel()">Cancelar</ion-button>
        <ion-button fill="solid" size="small" (click)="confirm()">Confirmar</ion-button>
      </div>
    </div>
  `,
  styles: [`
    .time-picker-popover { padding: 12px; min-width: 260px; }
    .popover-title { margin: 0 0 12px; font-size: 1rem; font-weight: 600; color: var(--ion-text-color); }
    .popover-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
  `],
})
export class TimePickerPopoverComponent implements OnInit {
  @Input() title = '';
  @Input() defaultTime = '';

  selectedTime = '';

  constructor(private popoverCtrl: PopoverController) {}

  ngOnInit() {
    // Si defaultTime viene vacío, usamos la hora actual
    this.selectedTime = this.defaultTime || new Date().toISOString();
  }

  cancel() {
    this.popoverCtrl.dismiss();
  }

  confirm() {
    this.popoverCtrl.dismiss({ timeIso: this.selectedTime });
  }
}
