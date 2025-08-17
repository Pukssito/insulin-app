import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';


import { InsulinBrand } from '../../models/insulin';
import { InsulinService } from 'src/service/insulin.service';

@Component({
  standalone: true,
  selector: 'app-setup',
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './setup.page.html',
  styleUrls: ['./setup.page.scss'],
})
export class SetupPage {
  tab: 'pen' | 'vial' = 'pen';
  q = '';
  all: InsulinBrand[] = [];
  selected = new Set<string>();

  constructor(private svc: InsulinService, private router: Router) {
    this.all = this.svc.getCatalog();
  }

  listForTab() {
    const q = this.q.toLowerCase().trim();
    return this.all
      .filter(b => b.device === this.tab)
      .filter(b => !q || b.tradeName.toLowerCase().includes(q));
  }

  toggle(id: string) {
    this.selected.has(id) ? this.selected.delete(id) : this.selected.add(id);
  }

  async save() {
    await this.svc.setProfileByIds(Array.from(this.selected));
    this.router.navigateByUrl('/home');
  }
}
