/**
 * Stub entity types for the save shape.
 *
 * Ticket 01 only fixes identity (every entity carries a stable `id: string`, uuid v4) and
 * the field names of {@link SaveData}. Full field sets are filled in by later tickets:
 * catalogs (02/03), programs & blocks (05), scheduler state (04), results & session (06),
 * reports (09). Keep these minimal so later tickets can extend without churn.
 */

import type { SchedulerId } from '../scheduler/scheduler.ts';
import type { ProgressionTarget } from '../progression/progression.ts';

/** Catalog entry: a muscle. Filled by the muscle-catalog ticket (Phase 2 UI). */
export interface Muscle {
  id: string;
  name: string;
}

/**
 * A weighted link from an exercise to a muscle in the muscle catalog. `involvement` is the
 * manual 0..1 engagement coefficient (see CONTEXT.md → Мышца). Phase 1 leaves the list empty;
 * the muscle-catalog UI (Phase 2) populates it. Defined here so the field shape is stable.
 */
export interface MuscleRef {
  /** Id of the referenced {@link Muscle}. */
  muscleId: string;
  /** Engagement coefficient in the range 0..1. */
  involvement: number;
}

/**
 * Catalog entry: an exercise (movement), e.g. «Жим гантелей лёжа 30°». Lives in the catalog
 * independently of any program (see CONTEXT.md → Упражнение).
 */
export interface Exercise {
  /** Stable uuid v4 identity; references from blocks/results point here. */
  id: string;
  /** Display name; also the matching key on import. */
  name: string;
  /** Free-text zone (Спина, Грудь…); coarse bucket, autocompleted from prior values. */
  zone: string;
  /** Reference video URLs. */
  videoLinks: string[];
  /** True when the movement is loaded by bodyweight rather than external weight. */
  isBodyweight: boolean;
  /** Increment (kg) of the equipment's weight stack/plates; used by weight pickers. */
  equipmentWeightStep: number;
  /** Free-text notes. */
  notes: string;
  /** Weighted muscle links; empty in Phase 1 (populated by the muscle-catalog ticket). */
  muscleRefs: MuscleRef[];
}

/**
 * A per-set static target for one exercise slot: weight (kg) + reps. Phase 1 progression is
 * static (fixed weight/reps), see ADR 0003. The shape is deliberately the same as
 * {@link ProgressionTarget} so Phase 2 can swap this field for a full progression grid on
 * {@link BlockExercise} without changing consumers that only read `weight`/`reps`.
 */
export type StaticTarget = ProgressionTarget;

/**
 * One exercise occurrence inside a {@link Block}. Carries its own stable `id` (independent of
 * the catalog `exerciseId`) so references survive re-linking on import (see CONTEXT.md →
 * Сетка прогрессии, which lives on this slot in Phase 2).
 */
export interface BlockExercise {
  /** Stable uuid v4 slot identity, used to re-link references on import; distinct from `exerciseId`. */
  id: string;
  /** Reference into the exercise catalog ({@link Exercise.id}). */
  exerciseId: string;
  /**
   * Phase 1 static target ({weight, reps}). Phase 2 replaces this with a progression grid
   * (see ADR 0003 / {@link Progression}); the field is kept progression-compatible in shape.
   */
  target: StaticTarget;
}

/**
 * Structural unit of a {@link Workout} (see CONTEXT.md → Блок). Holds one or more exercises,
 * the number of sets, and the two intra-block rest intervals. A block with two or more
 * exercises is executed as a superset (A→B→A→B) — a superset is NOT a separate entity, it is
 * defined purely by `exercises.length >= 2`.
 */
export interface Block {
  /** Stable uuid v4 identity. */
  id: string;
  /** One or more exercise slots. Length >= 2 makes this block a superset. */
  exercises: BlockExercise[];
  /** Number of sets performed, >= 1. */
  sets: number;
  /** Rest between sets (`междуСетами`), seconds, >= 0. */
  betweenSetsRest: number;
  /** Rest between superset exercises (`междуУпражнениямиСуперсета`), seconds, >= 0. */
  betweenSupersetExercisesRest: number;
}

/**
 * One training day of a {@link Plan}: an ordered list of {@link Block}s plus the rest interval
 * between blocks. This is a plan/description, not a performed fact (see CONTEXT.md → Тренировка
 * vs Сессия).
 */
export interface Workout {
  /** Stable uuid v4 identity. */
  id: string;
  /** Ordered blocks to perform. */
  blocks: Block[];
  /** Rest between blocks (`междуБлоками`), seconds, >= 0; preloads the timer. */
  betweenBlocksRest: number;
}

/**
 * One day of a {@link Plan}: either a rest day or a training day carrying a {@link Workout}
 * (see CONTEXT.md → День отдыха / Тренировка). Modelled as a tagged union; days are positional
 * (index within the plan is the identity), so there is no separate `id`.
 */
export type PlanDay =
  | { kind: 'rest' }
  | { kind: 'workout'; workout: Workout };

/**
 * A plan: a fixed-length sequence of days (see CONTEXT.md → План). The plan length in days is
 * exactly `days.length`; each day is a rest day or a training day.
 */
export interface Plan {
  /** Stable uuid v4 identity. */
  id: string;
  /** Ordered days; plan length in days = `days.length` (>= 1). */
  days: PlanDay[];
}

/**
 * A training program: the top planning unit (see CONTEXT.md → Программа). Holds plans and,
 * in later phases, a rotation pattern over them. Phase 1 uses exactly one plan (the structure
 * is an array so multi-plan rotation can arrive in Phase 2 without a shape change); the trivial
 * rotation is "repeat the single plan".
 */
export interface Program {
  /** Stable uuid v4 identity. */
  id: string;
  /** Display name; also the matching key on import. */
  name: string;
  /** Plans making up the program. Phase 1: exactly one; the array leaves room for rotation. */
  plans: Plan[];
  /**
   * Recommended scheduler strategy (data only; see CONTEXT.md → Расписание). At launch the user
   * picks a scheduler, defaulting to this one. Phase 1 ids: `'calendar'` | `'hybrid'`.
   */
  recommendedSchedulerId: SchedulerId;
}

/**
 * Binding of the currently running program to a chosen scheduler strategy.
 * Filled by the program-launch ticket.
 */
export interface ActiveProgram {
  programId: string;
  /** Id of the chosen scheduler strategy, e.g. 'calendar' | 'hybrid'. */
  schedulerId: string;
}

/**
 * Opaque per-scheduler runtime state (start date, cursor, …) persisted separately from the
 * program. Each {@link Scheduler} owns its own shape; the core treats it as opaque JSON.
 * Filled by the scheduler ticket (04).
 */
export type SchedulerState = Record<string, unknown>;

/** A recorded performed set. Filled by the session/results ticket (06). */
export interface Result {
  id: string;
}

/**
 * A single bodyweight measurement (the "Лог веса тела" / bodyweight log; see CONTEXT.md).
 *
 * Append-only entries; the app never edits an existing measurement in place, it records a new
 * one. Ordered by {@link BodyweightEntry.date} when read for charts (Phase 2). Units are always
 * kilograms (SaveData invariant #4).
 */
export interface BodyweightEntry {
  id: string;
  /** Measured bodyweight in kilograms. */
  weight: number;
  /** When the measurement was taken, epoch milliseconds (from the injected `Clock`). */
  date: number;
}

/** The current unfinished workout session; survives reload and day change. Filled by ticket 06. */
export interface Session {
  id: string;
}
