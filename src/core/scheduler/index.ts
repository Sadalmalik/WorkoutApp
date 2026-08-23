/** Scheduler subsystem barrel (ADR 0001, ticket 04). */

export type { Scheduler, SchedulerId } from './scheduler.ts';

export { DAY_MS, dayIndex } from './day.ts';
export { applyBlockOrder } from './block-order.ts';

export { CalendarScheduler, asCalendarState } from './calendar.ts';
export type { CalendarState } from './calendar.ts';
export { HybridScheduler, asHybridState } from './hybrid.ts';
export type { HybridState } from './hybrid.ts';

export { getScheduler, SCHEDULER_IDS, SCHEDULER_LABELS } from './registry.ts';

export type { HomeStatus } from './active.ts';
export {
  startProgram,
  homeState,
  getHomeState,
  currentWorkout,
  advanceSchedule,
  skipSchedule,
  deferCurrentBlock,
  pauseProgram,
  resumeProgram,
  cancelProgram,
  changeScheduler,
} from './active.ts';
