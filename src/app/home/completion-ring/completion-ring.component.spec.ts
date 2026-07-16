import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CompletionRingComponent } from './completion-ring.component';

describe('CompletionRingComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CompletionRingComponent] });
  });

  it('muestra el contador y el total en formato done/expected', () => {
    const fixture = TestBed.createComponent(CompletionRingComponent);
    fixture.componentRef.setInput('done', 2);
    fixture.componentRef.setInput('expected', 3);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.ring-count')?.textContent?.trim()).toBe('2');
    expect(el.querySelector('.ring-total')?.textContent?.trim()).toBe('/3');
  });

  it('se marca como is-done cuando done === expected', () => {
    const fixture = TestBed.createComponent(CompletionRingComponent);
    fixture.componentRef.setInput('done', 3);
    fixture.componentRef.setInput('expected', 3);
    fixture.detectChanges();

    const ring = fixture.nativeElement.querySelector('.completion-ring');
    expect(ring?.classList.contains('is-done')).toBe(true);
  });

  it('NO se marca como is-done cuando done < expected', () => {
    const fixture = TestBed.createComponent(CompletionRingComponent);
    fixture.componentRef.setInput('done', 1);
    fixture.componentRef.setInput('expected', 3);
    fixture.detectChanges();

    const ring = fixture.nativeElement.querySelector('.completion-ring');
    expect(ring?.classList.contains('is-done')).toBe(false);
  });

  it('cap el progreso a 1 cuando done > expected (defensivo)', () => {
    const fixture = TestBed.createComponent(CompletionRingComponent);
    fixture.componentRef.setInput('done', 5);
    fixture.componentRef.setInput('expected', 3);
    fixture.detectChanges();

    // completion() debe estar en [0,1]; el dashoffset nunca puede ser negativo
    // (si completion > 1, el stroke "se pasa" del círculo y queda visualmente mal)
    expect(fixture.componentInstance.completion()).toBe(1);
    expect(fixture.componentInstance.dashoffset()).toBe(0);
  });

  it('con expected=0 (caso sin franjas), completion es 0', () => {
    const fixture = TestBed.createComponent(CompletionRingComponent);
    fixture.componentRef.setInput('done', 0);
    fixture.componentRef.setInput('expected', 0);
    fixture.detectChanges();

    expect(fixture.componentInstance.completion()).toBe(0);
    expect(fixture.componentInstance.dashoffset()).toBeGreaterThan(0);
  });
});
