import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SummaryChipsComponent } from './summary-chips.component';

describe('SummaryChipsComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SummaryChipsComponent] });
  });

  it('muestra el chip de bolus cuando totalBolus > 0', () => {
    const fixture = TestBed.createComponent(SummaryChipsComponent);
    fixture.componentRef.setInput('totalBolus', 5);
    fixture.componentRef.setInput('avgGlucose', null);
    fixture.detectChanges();

    const chips = fixture.nativeElement.querySelectorAll('.summary-chip');
    expect(chips.length).toBe(1);
    expect(chips[0].textContent).toContain('5U bolus');
  });

  it('muestra el chip de glucosa media cuando avgGlucose no es null', () => {
    const fixture = TestBed.createComponent(SummaryChipsComponent);
    fixture.componentRef.setInput('totalBolus', 0);
    fixture.componentRef.setInput('avgGlucose', 120);
    fixture.detectChanges();

    const chips = fixture.nativeElement.querySelectorAll('.summary-chip');
    expect(chips.length).toBe(1);
    expect(chips[0].textContent).toContain('Media 120 mg/dL');
  });

  it('muestra ambos chips si ambos están presentes', () => {
    const fixture = TestBed.createComponent(SummaryChipsComponent);
    fixture.componentRef.setInput('totalBolus', 8);
    fixture.componentRef.setInput('avgGlucose', 95);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.summary-chip').length).toBe(2);
  });

  it('no muestra ningún chip si todo es 0/null', () => {
    const fixture = TestBed.createComponent(SummaryChipsComponent);
    fixture.componentRef.setInput('totalBolus', 0);
    fixture.componentRef.setInput('avgGlucose', null);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.summary-chip').length).toBe(0);
  });

  it.each([
    [50,  'glucose-low'],
    [95,  'glucose-normal'],
    [180, 'glucose-normal'],
    [200, 'glucose-high'],
  ])('glucose %s → clase %s', (value, expectedClass) => {
    const fixture = TestBed.createComponent(SummaryChipsComponent);
    fixture.componentRef.setInput('totalBolus', 0);
    fixture.componentRef.setInput('avgGlucose', value);
    fixture.detectChanges();

    expect(fixture.componentInstance.glucoseClass()).toBe(expectedClass);
  });
});
