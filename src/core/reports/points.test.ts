import { describe, it, expect } from 'vitest';
import type { Result } from '../model/index.ts';
import { DAY_MS } from '../scheduler/day.ts';
import { pickDaySet, exerciseDayPoints } from './points.ts';

/** A result at day `d` (UTC), plus optional intra-day offset in ms. */
function res(exerciseId: string, day: number, weight: number, reps: number, offsetMs = 0): Result {
  return { id: `${exerciseId}-${day}-${weight}-${reps}-${offsetMs}`, exerciseId, timestamp: day * DAY_MS + offsetMs, weight, reps };
}

describe('pickDaySet', () => {
  it('normal: takes the heaviest set', () => {
    const best = pickDaySet(
      [
        { weight: 100, reps: 5, timestamp: 1 },
        { weight: 120, reps: 3, timestamp: 2 },
        { weight: 110, reps: 8, timestamp: 3 },
      ],
      false,
    );
    expect(best.weight).toBe(120);
  });

  it('normal: on a weight tie takes the one with more reps', () => {
    const best = pickDaySet(
      [
        { weight: 100, reps: 5, timestamp: 1 },
        { weight: 100, reps: 9, timestamp: 2 },
      ],
      false,
    );
    expect(best.reps).toBe(9);
  });

  it('bodyweight: takes the set with the most reps', () => {
    const best = pickDaySet(
      [
        { weight: 0, reps: 12, timestamp: 1 },
        { weight: 10, reps: 20, timestamp: 2 },
        { weight: 5, reps: 15, timestamp: 3 },
      ],
      true,
    );
    expect(best.reps).toBe(20);
  });

  it('bodyweight: on a reps tie takes the heavier (added-weight) set', () => {
    const best = pickDaySet(
      [
        { weight: 0, reps: 15, timestamp: 1 },
        { weight: 10, reps: 15, timestamp: 2 },
      ],
      true,
    );
    expect(best.weight).toBe(10);
  });
});

describe('exerciseDayPoints', () => {
  it('groups by calendar day and keeps one representative per day, ascending', () => {
    const results: Result[] = [
      res('A', 2, 100, 5),
      res('A', 2, 120, 3), // heaviest on day 2
      res('A', 0, 90, 8),
      res('A', 5, 110, 6),
      res('B', 0, 999, 1), // other exercise, ignored
    ];
    const points = exerciseDayPoints(results, 'A', false);
    expect(points.map((p) => p.day)).toEqual([0, 2, 5]);
    expect(points.map((p) => p.weight)).toEqual([90, 120, 110]);
  });

  it('carries the representative set timestamp for real-time placement', () => {
    const results: Result[] = [
      res('A', 3, 100, 5, 1000),
      res('A', 3, 130, 5, 5000), // representative
    ];
    const [point] = exerciseDayPoints(results, 'A', false);
    expect(point.timestamp).toBe(3 * DAY_MS + 5000);
  });

  it('bodyweight exercise keys the day on reps', () => {
    const results: Result[] = [res('P', 1, 0, 12), res('P', 1, 5, 20)];
    const [point] = exerciseDayPoints(results, 'P', true);
    expect(point.reps).toBe(20);
  });

  it('returns no points for an exercise with no results', () => {
    expect(exerciseDayPoints([res('A', 0, 100, 5)], 'ZZZ', false)).toEqual([]);
  });
});
