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
  Theme,
  Settings,
  SaveData,
} from './model/index.ts';
export { DEFAULT_SETTINGS, SCHEMA_VERSION, emptySaveData } from './model/index.ts';

// Bodyweight log operations
export {
  addBodyweightEntry,
  listBodyweight,
  removeBodyweightEntry,
} from './bodyweight/index.ts';

// Program operations: builders, validation, storage-backed CRUD
export {
  DEFAULT_SCHEDULER_ID,
  BLOCK_DEFAULTS,
  DEFAULT_BETWEEN_BLOCKS_REST,
  DEFAULT_TARGET,
  newBlockExercise,
  newBlock,
  newWorkout,
  newRestDay,
  newWorkoutDay,
  newPlan,
  newProgram,
  validateProgram,
  createProgram,
  updateProgram,
  getProgram,
  listPrograms,
  deleteProgram,
} from './programs/index.ts';

// Exercise catalog operations + search
export type { ExerciseDraft } from './catalog/index.ts';
export {
  DEFAULT_WEIGHT_STEP,
  createExercise,
  updateExercise,
  getExercise,
  listExercises,
  searchExercises,
  collectZones,
} from './catalog/index.ts';

// Scheduler subsystem (ADR 0001): interface, both strategies, registry, active-program ops + Home
export type {
  Scheduler,
  SchedulerId,
  CalendarState,
  HybridState,
  HomeStatus,
} from './scheduler/index.ts';
export {
  DAY_MS,
  dayIndex,
  applyBlockOrder,
  CalendarScheduler,
  asCalendarState,
  HybridScheduler,
  asHybridState,
  getScheduler,
  SCHEDULER_IDS,
  SCHEDULER_LABELS,
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
} from './scheduler/index.ts';

// Session subsystem (ticket 05): lifecycle, ad-hoc, continue/finish predicate
export type { SessionSummary, ActiveSlot } from './session/index.ts';
export {
  getSession,
  isSessionComplete,
  activeSlot,
  needsResumeDecision,
  startSession,
  logSet,
  editSessionSet,
  removeSessionSet,
  finishSession,
  abandonSession,
  deferSessionBlock,
  startAdHoc,
  endAdHoc,
  logAdHocResult,
} from './session/index.ts';

// Timeline view-model selectors (ticket 07)
export type {
  TimelineModel,
  TimelineBlock,
  TimelineDot,
  TimelineBlockState,
} from './session/index.ts';
export { timelineModel, previewDeferredOrder } from './session/index.ts';

// Import/export subsystem (ticket 11: export; ticket 12: import)
export type {
  ExportKind,
  ExportEnvelope,
  FullExport,
  ProgramShareExport,
  ExportDocument,
} from './import-export/index.ts';
export {
  exportFull,
  exportProgramShare,
  collectExerciseIds,
  collectMuscleIds,
  exportToJson,
} from './import-export/index.ts';

// Strategy contracts (interfaces only; implementations arrive in later tickets)
export type { Report, DataPoint } from './reports/report.ts';
export type { Progression, ProgressionTarget } from './progression/progression.ts';
