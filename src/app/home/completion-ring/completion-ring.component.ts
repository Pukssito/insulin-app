import { Component, input, computed } from '@angular/core';

/**
 * Anillo SVG que muestra el progreso de la basal del día.
 * Componente dumb: recibe `done` y `expected`, calcula internamente
 * el porcentaje, la circunferencia y el offset del trazo.
 */
@Component({
  selector: 'app-completion-ring',
  standalone: true,
  template: `
    <div class="completion-ring" [class.is-done]="isDone()">
      <svg viewBox="0 0 50 50" class="ring-svg">
        <circle cx="25" cy="25" r="22" class="ring-bg" />
        <circle cx="25" cy="25" r="22" class="ring-fg"
                [attr.stroke-dasharray]="circumference"
                [attr.stroke-dashoffset]="dashoffset()"
                transform="rotate(-90 25 25)" />
      </svg>
      <div class="ring-text">
        <span class="ring-count">{{ done() }}</span>
        <span class="ring-total">/{{ expected() }}</span>
      </div>
    </div>
  `,
  styleUrls: ['./completion-ring.component.scss'],
})
export class CompletionRingComponent {
  done = input.required<number>();
  expected = input.required<number>();

  // r=22, circumference = 2πr
  protected readonly circumference = 2 * Math.PI * 22;

  protected readonly completion = computed(() => {
    const exp = this.expected();
    if (exp === 0) return 0;
    return Math.min(this.done() / exp, 1);
  });

  protected readonly dashoffset = computed(() =>
    this.circumference * (1 - this.completion())
  );

  protected readonly isDone = computed(() => this.completion() === 1);
}
