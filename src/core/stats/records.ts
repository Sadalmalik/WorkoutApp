/**
 * Session personal-record detection and session statistics (ticket 09) — pure core, no DOM.
 *
 * The result screen shows, above everything else, the personal records set during the just-finished
 * session. A record is detected by comparing the session's best set for an exercise against the best
 * in the history that predates the session: because every logged set is appended to the shared
 * {@link Result} history live, the caller passes the results recorded BEFORE the session start as
 * `priorResults` (typically `results.filter(r => r.timestamp < startedAt)`).
 *
 * The compared metric follows the same key as the charts: max weight for a normal exercise, max reps
 * for a "вес тела" one (see CONTEXT.md → Результат).
 */

import type { Result, SessionSet } from '../model/index.ts';

/** Which metric a record is about: heaviest set (normal) or most reps (bodyweight). */
export type RecordKind = 'weight' | 'reps';

/** A personal record set during a session: the exercise, the metric, the new best and the old one. */
export interface PersonalRecord {
  exerciseId: string;
  kind: RecordKind;
  /** The new best achieved this session. */
  value: number;
  /** The best before the session, or `null` when this is the first ever result for the exercise. */
  previous: number | null;
}

/**
 * Detect the personal records set during a session.
 *
 * For every exercise touched by `sessionSets`, the session best of its key metric is compared with
 * the prior best from `priorResults`. A record is reported when the session strictly beats the prior
 * best, or when there is no prior result at all (first-ever performance). Exercises are reported in
 * the order they first appear in `sessionSets`.
 */
export function detectPersonalRecords(
  priorResults: readonly Result[],
  sessionSets: readonly SessionSet[],
  isBodyweight: (exerciseId: string) => boolean,
): PersonalRecord[] {
  const order: string[] = [];
  const sessionBest = new Map<string, number>();

  for (const s of sessionSets) {
    const bw = isBodyweight(s.exerciseId);
    const metric = bw ? s.reps : s.weight;
    if (!sessionBest.has(s.exerciseId)) order.push(s.exerciseId);
    sessionBest.set(s.exerciseId, Math.max(sessionBest.get(s.exerciseId) ?? 0, metric));
  }

  const records: PersonalRecord[] = [];
  for (const exerciseId of order) {
    const bw = isBodyweight(exerciseId);
    const value = sessionBest.get(exerciseId)!;
    const previous = priorBest(priorResults, exerciseId, bw);
    if (previous === null || value > previous) {
      records.push({ exerciseId, kind: bw ? 'reps' : 'weight', value, previous });
    }
  }
  return records;
}

/** Best value of the exercise's key metric over prior results, or `null` if it has none. */
function priorBest(results: readonly Result[], exerciseId: string, isBodyweight: boolean): number | null {
  let best: number | null = null;
  for (const r of results) {
    if (r.exerciseId !== exerciseId) continue;
    const metric = isBodyweight ? r.reps : r.weight;
    if (best === null || metric > best) best = metric;
  }
  return best;
}
