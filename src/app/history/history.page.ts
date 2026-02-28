import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { InsulinService } from '../../service/insulin.service';

@Component({
  selector: 'app-history',
  templateUrl: './history.page.html',
  styleUrls: ['./history.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, RouterModule]
})
export class HistoryPage implements OnInit {
  days: string[] = [];
  selectedDate: string | null = null;
  highlightedDates: any[] = [];

  constructor(public svc: InsulinService) { }

  ngOnInit() {
    this.days = this.svc.getHistoryDays();
    // Resaltar días con datos en el calendario
    this.highlightedDates = this.days.map(date => ({
      date,
      textColor: '#ffffff',
      backgroundColor: '#4db6ac'
    }));
    
    // Seleccionar hoy por defecto si hay datos, o el último día registrado
    if (this.days.length > 0) {
      this.selectedDate = this.days[0];
    }
  }

  onDateChange(event: any) {
    const val = event.detail.value;
    this.selectedDate = val ? val.split('T')[0] : null;
  }

  getDaySummary(dateYmd: string) {
    const doses = this.svc.getEntriesForDate(dateYmd);
    const glucose = this.svc.getGlucoseForDate(dateYmd);
    
    const basalCount = doses.filter(d => d.type === 'basal').length;
    const bolusSum = doses.filter(d => d.type === 'bolus').reduce((acc, d) => acc + d.units, 0);
    
    let avgGlucose = 0;
    if (glucose.length > 0) {
      avgGlucose = Math.round(glucose.reduce((acc, g) => acc + g.value, 0) / glucose.length);
    }

    return { basalCount, bolusSum, avgGlucose };
  }

  getEntries(dateYmd: string) {
    return this.svc.getEntriesForDate(dateYmd);
  }

  getGlucose(dateYmd: string) {
    return this.svc.getGlucoseForDate(dateYmd);
  }
}
