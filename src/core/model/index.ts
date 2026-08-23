export { newId } from './ids.ts';

export type {
  Muscle,
  MuscleRef,
  Exercise,
  Program,
  Plan,
  PlanDay,
  Workout,
  Block,
  BlockExercise,
  StaticTarget,
  ActiveProgram,
  SchedulerState,
  Result,
  BodyweightEntry,
  Session,
  SessionSet,
  SessionCursor,
  AdHocState,
} from './entities.ts';

export type { Theme, Settings } from './settings.ts';
export { DEFAULT_SETTINGS } from './settings.ts';

export type { SaveData } from './save-data.ts';
export { SCHEMA_VERSION, emptySaveData } from './save-data.ts';
