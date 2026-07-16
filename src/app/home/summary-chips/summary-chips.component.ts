import { Component, input, computed } from '@angular/core';

/**
 * Chips de resumen: total de bolus del día y glucosa media.
 * Componente dumb: recibe los valores, decide si mostrarlos y
 * aplica la clase CSS según el rango de la glucosa.
 *
 * Reglas de glucosa (idénticas a las del SCSS):
 *   < 70  → glucose-low
 *   > 180 → glucose-high
 *   resto → glucose-normal
 */
@Component({
  selector: 'app-summary-chips',
  standalone: true,
  template: `
    @if (totalBolus() > 0) {
      <div class="summary-chip">
        <span class="chip-glyph-inline">🔥</span>
        <span>{{ totalBolus() }}U bolus</span>
      </div>
    }
    @if (avgGlucose() !== null) {
      <div class="summary-chip" [class]="glucoseClass()">
        <span class="chip-glyph-inline">💧</span>
        <span>Media {{ avgGlucose() }} mg/dL</span>
      </div>
    }
  `,
  styleUrls: ['./summary-chips.component.scss'],
})
export class SummaryChipsComponent {
  totalBolus = input.required<number>();
  avgGlucose = input<number | null>(null);

  protected readonly glucoseClass = computed(() => {
    const v = this.avgGlucose();
    if (v == null) return '';
    if (v < 70) return 'glucose-low';
    if (v > 180) return 'glucose-high';
    return 'glucose-normal';
  });
}
