import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { InsulinStore } from '../../service/insulin.store';
import { SlotConfig } from '../../models/models';

@Component({
  selector: 'app-history',
  templateUrl: './history.page.html',
  styleUrls: ['./history.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, RouterModule]
})
export class HistoryPage {
  days: string[] = [];
  selectedDate: string | null = null;
  highlightedDates: any[] = [];

  constructor(public store: InsulinStore) {
    this.refreshDays();
    if (this.days.length > 0) {
      this.selectedDate = this.days[0];
    }
  }

  get slots(): SlotConfig[] { return this.store.slots(); }

  private refreshDays() {
    this.days = this.store.getHistoryDays();
    this.highlightedDates = this.days.map(date => ({
      date,
      textColor: '#ffffff',
      backgroundColor: '#4db6ac'
    }));
  }

  onDateChange(event: any) {
    const val = event.detail.value;
    this.selectedDate = val ? val.split('T')[0] : null;
  }

  slotLabel(id: string): string {
    return this.slots.find(s => s.id === id)?.label ?? id;
  }

  getDaySummary(dateYmd: string) {
    const doses = this.store.getEntriesForDate(dateYmd);
    const glucose = this.store.getGlucoseForDate(dateYmd);

    const basalCount = doses.filter(d => d.type === 'basal').length;
    const bolusSum = doses.filter(d => d.type === 'bolus').reduce((acc, d) => acc + d.units, 0);

    let avgGlucose = 0;
    if (glucose.length > 0) {
      avgGlucose = Math.round(glucose.reduce((acc, g) => acc + g.value, 0) / glucose.length);
    }

    return { basalCount, bolusSum, avgGlucose };
  }

  getEntries(dateYmd: string) {
    return this.store.getEntriesForDate(dateYmd);
  }

  getGlucose(dateYmd: string) {
    return this.store.getGlucoseForDate(dateYmd);
  }

  getNotes(dateYmd: string) {
    return this.store.getNotesForDate(dateYmd);
  }
}
