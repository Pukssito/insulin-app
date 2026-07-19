import { describe, it, expect } from 'vitest';
import {
  iconForSlot,
  timeRangeForSlot,
  glucoseClassFor,
  bolusPillsFor,
  bolusOverflowFor,
  trimNoteText,
  BOLUS_PILLS_MAX,
} from './slot-card.helpers';
import { SlotConfig } from '../../../models/models';

const slot = (overrides: Partial<SlotConfig> = {}): SlotConfig => ({
  id: 'morning',
  label: 'Mañana',
  startMin: 6 * 60,
  endMin: 12 * 60,
  kind: 'both',
  ...overrides,
});

describe('iconForSlot', () => {
  it.each([
    [{ id: 'morning',         kind: 'bolus' }, '☀'],
    [{ id: 'MORNING',         kind: 'bolus' }, '☀'],  // case-insensitive
    [{ id: 'morning_extra',   kind: 'bolus' }, '☀'],
    [{ id: 'afternoon',       kind: 'bolus' }, '⛅'],
    [{ id: 'afternoon_extra', kind: 'bolus' }, '⛅'],
    [{ id: 'evening',         kind: 'bolus' }, '☾'],
  ])('iconForSlot(%j) === %j', (cfg, expected) => {
    expect(iconForSlot(slot(cfg))).toBe(expected);
  });

  it('BASAL: devuelve ⏱ (cronómetro), independientemente del id', () => {
    // Aunque el id sea 'basal_night', el icono ya no es la luna
    // porque el usuario puede configurar la basal a cualquier hora.
    expect(iconForSlot(slot({ id: 'basal_night', kind: 'basal' }))).toBe('⏱');
    expect(iconForSlot(slot({ id: 'nph_morning',  kind: 'basal' }))).toBe('⏱');
    expect(iconForSlot(slot({ id: 'nph_night',    kind: 'basal' }))).toBe('⏱');
  });

  it('kind="both" con id nocturno: usa el icono de luna (sigue siendo comida)', () => {
    expect(iconForSlot(slot({ id: 'evening', kind: 'both' }))).toBe('☾');
  });

  it('devuelve el icono neutro ◌ si no matchea ningún patrón', () => {
    expect(iconForSlot(slot({ id: 'lunch_random_123', kind: 'bolus' }))).toBe('◌');
  });
});

describe('timeRangeForSlot', () => {
  it('formatea morning (6-12) como 06:00–12:00', () => {
    expect(timeRangeForSlot(slot())).toBe('06:00–12:00');
  });

  it('formatea horas no redondeadas', () => {
    expect(timeRangeForSlot(slot({ startMin: 7 * 60 + 30, endMin: 22 * 60 + 45 })))
      .toBe('07:30–22:45');
  });
});

describe('glucoseClassFor', () => {
  it.each<[number | null, '' | 'glucose-low' | 'glucose-normal' | 'glucose-high']>([
    [null,  ''],
    [0,    'glucose-low'],
    [69,   'glucose-low'],
    [70,   'glucose-normal'],
    [95,   'glucose-normal'],
    [120,  'glucose-normal'],
    [180,  'glucose-normal'],
    [181,  'glucose-high'],
    [300,  'glucose-high'],
  ])('glucoseClassFor(%s) === %s', (value, expected) => {
    expect(glucoseClassFor(value)).toBe(expected);
  });
});

describe('bolusPillsFor', () => {
  it('devuelve array vacío si sum es 0', () => {
    expect(bolusPillsFor(0)).toEqual([]);
  });

  it('devuelve un índice por cada bolus hasta el máximo', () => {
    expect(bolusPillsFor(5)).toEqual([0, 1, 2, 3, 4]);
  });

  it('cap a max si sum > max', () => {
    expect(bolusPillsFor(20).length).toBe(BOLUS_PILLS_MAX);
  });

  it('acepta un max personalizado', () => {
    expect(bolusPillsFor(10, 3)).toEqual([0, 1, 2]);
  });
});

describe('bolusOverflowFor', () => {
  it('0 cuando sum <= max', () => {
    expect(bolusOverflowFor(0)).toBe(0);
    expect(bolusOverflowFor(5)).toBe(0);
    expect(bolusOverflowFor(15)).toBe(0);
  });

  it('devuelve sum - max cuando sum > max', () => {
    expect(bolusOverflowFor(20)).toBe(5);
  });

  it('acepta un max personalizado', () => {
    expect(bolusOverflowFor(10, 3)).toBe(7);
  });
});

describe('trimNoteText', () => {
  it.each<[string | null | undefined, string | null]>([
    ['',           null],
    ['   ',        null],
    [null,         null],
    [undefined,    null],
    ['hola',       'hola'],
    ['  hola  ',   'hola'],
    [' hola mundo ', 'hola mundo'],
    ['\t\n hola \n\t', 'hola'],
  ])('trimNoteText(%j) === %j', (input, expected) => {
    expect(trimNoteText(input)).toBe(expected);
  });
});
