import { describe, it, expect } from 'vitest';
import type { ExerciseDayPoint } from './points.ts';
import { maxWeightReport, maxWeightRepsReport, EXERCISE_REPORTS } from './exercise-reports.ts';

function pt(day: number, weight: number, reps: number): ExerciseDayPoint {
  return { day, timestamp: day * 86_400_000, weight, reps };
}

const POINTS = [pt(0, 100, 5), pt(1, 120, 3), pt(2, 110, 8)];

describe('maxWeightReport', () => {
  it('normal: single weight line', () => {
    const r = maxWeightReport(false);
    expect(r.lineCount).toBe(1);
    expect(r.separateCharts).toBe(false);
    expect(r.lineLabel(0)).toBe('Вес, кг');
    expect(r.valueAt(0, POINTS[1])).toBe(120);
    expect(r.lineMax(0, POINTS)).toBe(120);
  });

  it('bodyweight: single reps line', () => {
    const r = maxWeightReport(true);
    expect(r.lineLabel(0)).toBe('Повторы');
    expect(r.valueAt(0, POINTS[2])).toBe(8);
    expect(r.lineMax(0, POINTS)).toBe(8);
  });

  it('guards an all-zero axis to 1', () => {
    const r = maxWeightReport(false);
    expect(r.lineMax(0, [pt(0, 0, 0)])).toBe(1);
  });
});

describe('maxWeightRepsReport', () => {
  it('normal: weight then reps on separate charts', () => {
    const r = maxWeightRepsReport(false);
    expect(r.lineCount).toBe(2);
    expect(r.separateCharts).toBe(true);
    expect(r.lineLabel(0)).toBe('Вес, кг');
    expect(r.lineLabel(1)).toBe('Повторы');
    expect(r.valueAt(0, POINTS[1])).toBe(120);
    expect(r.valueAt(1, POINTS[2])).toBe(8);
  });

  it('bodyweight: reps is the key (first) line', () => {
    const r = maxWeightRepsReport(true);
    expect(r.lineLabel(0)).toBe('Повторы');
    expect(r.lineLabel(1)).toBe('Вес, кг');
    expect(r.valueAt(0, POINTS[2])).toBe(8);
  });
});

describe('EXERCISE_REPORTS registry', () => {
  it('offers both Phase 1 reports with stable ids', () => {
    expect(EXERCISE_REPORTS.map((d) => d.id)).toEqual(['max-weight', 'max-weight-reps']);
    expect(EXERCISE_REPORTS[0].make(false).id).toBe('max-weight');
    expect(EXERCISE_REPORTS[1].make(true).lineCount).toBe(2);
  });
});
