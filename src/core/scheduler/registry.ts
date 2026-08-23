/**
 * Scheduler registry: resolve a {@link Scheduler} implementation from the {@link SchedulerId}
 * stored on an {@link ActiveProgram}. The set is closed in Phase 1 (`calendar`, `hybrid`); adding
 * a strategy is a one-line entry here plus its implementation (ADR 0001).
 */

import type { Scheduler, SchedulerId } from './scheduler.ts';
import { CalendarScheduler } from './calendar.ts';
import { HybridScheduler } from './hybrid.ts';

/** Stateless singletons — schedulers hold no mutable state (all state lives in the save). */
const REGISTRY: Record<SchedulerId, Scheduler> = {
  calendar: new CalendarScheduler(),
  hybrid: new HybridScheduler(),
};

/** The scheduler for `id`. Throws on an unknown id (a corrupt/forward-version save). */
export function getScheduler(id: SchedulerId): Scheduler {
  const scheduler = REGISTRY[id];
  if (scheduler === undefined) throw new Error(`Unknown scheduler id: ${id}`);
  return scheduler;
}

/** All scheduler ids known to the app, for launch/selection UIs. */
export const SCHEDULER_IDS: readonly SchedulerId[] = ['calendar', 'hybrid'];

/** Human-readable Russian labels for the scheduler ids (used by launch/selection UIs). */
export const SCHEDULER_LABELS: Record<SchedulerId, string> = {
  calendar: 'Календарное',
  hybrid: 'Гибридное',
};
