import { describe, it, expect } from 'vitest';
import type { SessionSet } from '../model/index.ts';
import { sessionStats } from './summary.ts';

function set(weight: number, reps: number): SessionSet {
  return { exerciseId: 'A', weight, reps, timestamp: 0 };
}

describe('sessionStats', () => {
  it('computes volume, set count and duration', () => {
    const sets: SessionSet[] = [set(100, 5), set(80, 10)];
    expect(sessionStats(sets, 1_000, 61_000)).toEqual({
      volume: 100 * 5 + 80 * 10,
      setCount: 2,
      durationMs: 60_000,
    });
  });

  it('empty session is zero volume, zero sets', () => {
    expect(sessionStats([], 0, 0)).toEqual({ volume: 0, setCount: 0, durationMs: 0 });
  });

  it('never returns a negative duration', () => {
    expect(sessionStats([], 5_000, 1_000).durationMs).toBe(0);
  });
});
