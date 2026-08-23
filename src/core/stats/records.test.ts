import { describe, it, expect } from 'vitest';
import type { Result, SessionSet } from '../model/index.ts';
import { detectPersonalRecords } from './records.ts';

function res(exerciseId: string, weight: number, reps: number, timestamp = 0): Result {
  return { id: `${exerciseId}-${weight}-${reps}-${timestamp}`, exerciseId, weight, reps, timestamp };
}

function set(exerciseId: string, weight: number, reps: number): SessionSet {
  return { exerciseId, weight, reps, timestamp: 0 };
}

const NONE = () => false;

describe('detectPersonalRecords', () => {
  it('reports a weight record when the session beats prior history', () => {
    const prior = [res('A', 100, 5), res('A', 110, 3)];
    const sets = [set('A', 120, 2)];
    const records = detectPersonalRecords(prior, sets, NONE);
    expect(records).toEqual([{ exerciseId: 'A', kind: 'weight', value: 120, previous: 110 }]);
  });

  it('reports no record when the session does not beat history', () => {
    const prior = [res('A', 120, 5)];
    const sets = [set('A', 110, 8)];
    expect(detectPersonalRecords(prior, sets, NONE)).toEqual([]);
  });

  it('a tie is not a record (must be strictly greater)', () => {
    const prior = [res('A', 120, 5)];
    const sets = [set('A', 120, 5)];
    expect(detectPersonalRecords(prior, sets, NONE)).toEqual([]);
  });

  it('first-ever performance is a record with previous = null', () => {
    const sets = [set('A', 80, 10)];
    expect(detectPersonalRecords([], sets, NONE)).toEqual([
      { exerciseId: 'A', kind: 'weight', value: 80, previous: null },
    ]);
  });

  it('bodyweight exercise records on reps, ignoring weight', () => {
    const isBw = (id: string) => id === 'P';
    const prior = [res('P', 0, 15)];
    const sets = [set('P', 0, 12), set('P', 5, 20)]; // best reps = 20
    expect(detectPersonalRecords(prior, sets, isBw)).toEqual([
      { exerciseId: 'P', kind: 'reps', value: 20, previous: 15 },
    ]);
  });

  it('takes the session best across multiple sets and reports in first-seen order', () => {
    const prior = [res('A', 100, 5), res('B', 50, 5)];
    const sets = [set('B', 60, 3), set('A', 90, 5), set('A', 130, 1)];
    const records = detectPersonalRecords(prior, sets, NONE);
    expect(records.map((r) => r.exerciseId)).toEqual(['B', 'A']);
    expect(records.find((r) => r.exerciseId === 'A')?.value).toBe(130);
  });
});
