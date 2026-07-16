import { describe, it, expect } from 'vitest';
import {
  toYmdLocal,
  minutesNowLocal,
  formatRange,
  formatRelativeTime,
} from './date-utils';

describe('toYmdLocal', () => {
  it('formatea una fecha como YYYY-MM-DD en local time con zero-padding', () => {
    const d = new Date(2026, 0, 5); // 5 de enero de 2026 (mes 0 = enero)
    expect(toYmdLocal(d)).toBe('2026-01-05');
  });

  it('zero-padea meses y días < 10', () => {
    const d = new Date(2026, 8, 9); // 9 de septiembre
    expect(toYmdLocal(d)).toBe('2026-09-09');
  });
});

describe('minutesNowLocal', () => {
  it('devuelve los minutos transcurridos del día (0-1439)', () => {
    // 14:35 → 14*60 + 35 = 875
    const d = new Date(2026, 0, 1, 14, 35, 0);
    expect(minutesNowLocal(d)).toBe(14 * 60 + 35);
  });

  it('medianoche devuelve 0', () => {
    const d = new Date(2026, 0, 1, 0, 0, 0);
    expect(minutesNowLocal(d)).toBe(0);
  });
});

describe('formatRange', () => {
  it('formatea HH:MM–HH:MM con zero-padding y guion tipográfico', () => {
    expect(formatRange(6 * 60, 12 * 60)).toBe('06:00–12:00');
  });

  it('maneja horas no redondeadas', () => {
    expect(formatRange(7 * 60 + 30, 22 * 60 + 45)).toBe('07:30–22:45');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-07-16T12:00:00.000Z').getTime();

  it('devuelve "" si el ISO es null o undefined', () => {
    expect(formatRelativeTime(null, now)).toBe('');
    expect(formatRelativeTime(undefined, now)).toBe('');
  });

  it('devuelve "ahora" si el diff es negativo (fecha futura)', () => {
    const future = new Date(now + 60_000).toISOString();
    expect(formatRelativeTime(future, now)).toBe('ahora');
  });

  it('devuelve "ahora" si han pasado < 1 min', () => {
    const recent = new Date(now - 30_000).toISOString();
    expect(formatRelativeTime(recent, now)).toBe('ahora');
  });

  it('devuelve "hace X min" entre 1 min y 1 hora', () => {
    const t = new Date(now - 15 * 60_000).toISOString();
    expect(formatRelativeTime(t, now)).toBe('hace 15 min');
  });

  it('devuelve "hace Xh" entre 1 hora y 24 horas', () => {
    const t = new Date(now - 5 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(t, now)).toBe('hace 5h');
  });

  it('devuelve "ayer" cuando han pasado exactamente 24h', () => {
    const t = new Date(now - 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(t, now)).toBe('ayer');
  });

  it('devuelve "hace X días" cuando han pasado más de 24h', () => {
    const t = new Date(now - 3 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(t, now)).toBe('hace 3 días');
  });
});
