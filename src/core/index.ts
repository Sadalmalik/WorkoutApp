/**
 * Public API of the pure core engine.
 *
 * No React/DOM/`localStorage` imports live behind this barrel (the sole exception is the
 * `LocalStorageStorage` adapter, which only touches the ambient `localStorage` global inside
 * its methods). The React UI depends only on what is re-exported here.
 */

// Ports
export type { Clock, Storage } from './ports/index.ts';
export {
  SystemClock,
  FixedClock,
  LocalStorageStorage,
  InMemoryStorage,
  STORAGE_KEY,
} from './ports/index.ts';

// Model
export { newId } from './model/index.ts';
export type {
  Muscle,
  Exercise,
  Program,
  Workout,
  ActiveProgram,
  SchedulerState,
  Result,
  BodyweightEntry,
  Session,
  Theme,
  Settings,
  SaveData,
} from './model/index.ts';
export { DEFAULT_SETTINGS, SCHEMA_VERSION, emptySaveData } from './model/index.ts';

// Strategy contracts (interfaces only; implementations arrive in later tickets)
export type { Scheduler, SchedulerId } from './scheduler/scheduler.ts';
export type { Report, DataPoint } from './reports/report.ts';
export type { Progression, ProgressionTarget } from './progression/progression.ts';
