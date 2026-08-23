/**
 * Day-point aggregation for exercise progress charts (ticket 09).
 *
 * Reports (ADR 0002) draw lines over a sequence of {@link DataPoint}s; for an exercise the point is
 * one calendar day, condensed from every set logged that day to a single representative set. The
 * selection rule (see CONTEXT.md → Результат) is:
 *
 * - normal exercise: the heaviest set; on a weight tie, the one with more reps;
 * - "вес тела" exercise ({@link Exercise.isBodyweight}): the set with the most reps (weight tie-break).
 *
 * Everything here is pure of DOM/React and deterministic — the chart widget only displays what these
 * functions produce, and the metric semantics live in the {@link Report}.
 */

import type { Result } from '../model/index.ts';
import { dayIndex } from '../scheduler/day.ts';

/** The fields of a logged set the day-selection rule looks at. */
export interface DaySet {
  weight: number;
  reps: number;
  /** When the set was logged, epoch milliseconds. */
  timestamp: number;
}

/**
 * One aggregated day on an exercise chart: the representative set for that calendar day, tagged with
 * both the whole-day ordinal ({@link day}) and the representative set's real {@link timestamp} so the
 * widget can place points on a real-time axis (idle stretches show as gaps).
 */
export interface ExerciseDayPoint {
  /** Whole-day ordinal (see {@link dayIndex}); the chart's minimum time step is one day. */
  day: number;
  /** The representative set's timestamp, epoch ms (drives real-time x placement). */
  timestamp: number;
  weight: number;
  reps: number;
}

/**
 * Pick the representative set of a day from a non-empty list. Normal: heaviest, then most reps.
 * Bodyweight: most reps, then heaviest. On a full tie the earlier-listed set wins (stable).
 */
export function pickDaySet(sets: readonly DaySet[], isBodyweight: boolean): DaySet {
  if (sets.length === 0) throw new Error('pickDaySet: empty set list');
  return sets.reduce((best, s) => (isBetter(s, best, isBodyweight) ? s : best));
}

function isBetter(a: DaySet, best: DaySet, isBodyweight: boolean): boolean {
  if (isBodyweight) {
    if (a.reps !== best.reps) return a.reps > best.reps;
    return a.weight > best.weight;
  }
  if (a.weight !== best.weight) return a.weight > best.weight;
  return a.reps > best.reps;
}

/**
 * Aggregate the results of one exercise into per-day chart points, ascending by day. Days with no
 * set produce no point (gaps are the widget's concern), so the minimum step between two points is
 * one day but the distance between them reflects real elapsed time.
 */
export function exerciseDayPoints(
  results: readonly Result[],
  exerciseId: string,
  isBodyweight: boolean,
): ExerciseDayPoint[] {
  const byDay = new Map<number, DaySet[]>();
  for (const r of results) {
    if (r.exerciseId !== exerciseId) continue;
    const d = dayIndex(r.timestamp);
    const bucket = byDay.get(d);
    const set: DaySet = { weight: r.weight, reps: r.reps, timestamp: r.timestamp };
    if (bucket === undefined) byDay.set(d, [set]);
    else bucket.push(set);
  }

  const points: ExerciseDayPoint[] = [];
  for (const [day, sets] of byDay) {
    const best = pickDaySet(sets, isBodyweight);
    points.push({ day, timestamp: best.timestamp, weight: best.weight, reps: best.reps });
  }
  points.sort((a, b) => a.day - b.day);
  return points;
}
